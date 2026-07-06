import { db } from "@/db";
import {
  accounts,
  transactions,
  categories,
  merchantCategories,
  syncRuns,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { getTransactions, getBalances } from "@/lib/enablebanking/client";
import { mapTransaction } from "@/lib/enablebanking/normalize";
import { ruleCategory, geminiCategorize } from "@/lib/categorize";
import { sendNtfy, budgetMessage } from "@/lib/notify";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { env } from "@/lib/env";
import type { NewTransaction } from "@/db/schema";

const OVERLAP_DAYS = 7; // re-fetch a small window to catch late-booked items
const DEFAULT_BACKFILL_DAYS = 90;
const MAX_NOTIFY = 40; // skip per-tx notifications on large backfills

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export interface SyncResult {
  ok: boolean;
  newTransactions: number;
  accountsSynced: number;
  error?: string;
}

/**
 * Pull new transactions for every linked account, dedupe-insert, categorize
 * (rules → cache → optional Gemini), refresh balances, and fire budget
 * notifications for newly-booked spending.
 */
export async function runSync(opts: { useGemini?: boolean } = {}): Promise<SyncResult> {
  const [run] = await db.insert(syncRuns).values({}).returning({ id: syncRuns.id });

  try {
    const accs = await db.select().from(accounts);
    if (accs.length === 0) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: 1, newTransactions: 0 })
        .where(eq(syncRuns.id, run.id));
      return { ok: true, newTransactions: 0, accountsSynced: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const inserted: NewTransaction[] = [];

    for (const acc of accs) {
      // Determine start date: last booked tx minus overlap, else backfill.
      const [{ maxDate }] = await db
        .select({ maxDate: sql<string | null>`max(${transactions.bookingDate})` })
        .from(transactions)
        .where(eq(transactions.accountUid, acc.uid));

      const from = maxDate
        ? isoDaysAgoFrom(maxDate, OVERLAP_DAYS)
        : isoDaysAgo(DEFAULT_BACKFILL_DAYS);

      // Balances.
      try {
        const bal = await getBalances(acc.uid);
        const chosen =
          bal.balances.find((b) => b.balance_type === "CLBD") ?? bal.balances[0];
        if (chosen) {
          await db
            .update(accounts)
            .set({
              balance: chosen.balance_amount.amount,
              balanceType: chosen.balance_type ?? null,
              balanceUpdatedAt: new Date(),
            })
            .where(eq(accounts.uid, acc.uid));
        }
      } catch (e) {
        console.error(`balances failed for ${acc.uid}:`, e);
      }

      // Transactions.
      const raw = await getTransactions(acc.uid, from, today);
      for (const tx of raw) {
        const row = mapTransaction(acc.uid, tx);
        const res = await db
          .insert(transactions)
          .values(row)
          .onConflictDoNothing({
            target: [transactions.accountUid, transactions.dedupeKey],
          })
          .returning({ id: transactions.id });
        if (res.length > 0) inserted.push({ ...row, id: res[0].id } as NewTransaction);
      }
    }

    // ─── Categorize the newly-inserted rows ──────────────────────────────────
    if (inserted.length > 0) {
      await categorizeInserted(inserted, opts.useGemini ?? false);
    }

    // ─── Budget notifications for new outflows ───────────────────────────────
    await notifyBudgets(inserted);

    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), ok: 1, newTransactions: inserted.length })
      .where(eq(syncRuns.id, run.id));

    return { ok: true, newTransactions: inserted.length, accountsSynced: accs.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), ok: 0, error: msg.slice(0, 1000) })
      .where(eq(syncRuns.id, run.id));
    return { ok: false, newTransactions: 0, accountsSynced: 0, error: msg };
  }
}

function isoDaysAgoFrom(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(d.getTime() - days * 86400_000).toISOString().slice(0, 10);
}

/** Apply rules → merchant cache → Gemini to the given rows and persist. */
async function categorizeInserted(rows: NewTransaction[], useGemini: boolean) {
  const cats = await db.select().from(categories);
  const nameToId = new Map(cats.map((c) => [c.name, c.id]));
  const uncategorizedId = nameToId.get("Uncategorized") ?? null;

  // Existing merchant cache for the merchants in this batch.
  const merchants = Array.from(
    new Set(rows.map((r) => r.merchant).filter((m): m is string => !!m))
  );
  const cache = new Map<string, number>();
  if (merchants.length > 0) {
    const cached = await db
      .select()
      .from(merchantCategories)
      .where(inArray(merchantCategories.merchant, merchants));
    for (const c of cached) cache.set(c.merchant, c.categoryId);
  }

  const needGemini: string[] = [];

  // First pass: rules + cache.
  const decided = new Map<number, { catId: number; source: string }>(); // tx id → decision
  for (const r of rows) {
    if (!r.id) continue;
    const ruleName = ruleCategory({
      merchant: r.merchant ?? null,
      mcc: r.mcc ?? null,
      remittance: r.remittance ?? null,
      direction: r.direction as "CRDT" | "DBIT",
    });
    if (ruleName && nameToId.has(ruleName)) {
      decided.set(r.id, { catId: nameToId.get(ruleName)!, source: "rule" });
      continue;
    }
    if (r.merchant && cache.has(r.merchant)) {
      decided.set(r.id, { catId: cache.get(r.merchant)!, source: "cache" });
      continue;
    }
    if (r.merchant) needGemini.push(r.merchant);
  }

  // Second pass: Gemini for unknown merchants (weekly cadence).
  if (useGemini && needGemini.length > 0) {
    const uniq = Array.from(new Set(needGemini));
    const guesses = await geminiCategorize(uniq);
    for (const [merchant, catName] of Object.entries(guesses)) {
      const catId = nameToId.get(catName);
      if (!catId) continue;
      cache.set(merchant, catId);
      await db
        .insert(merchantCategories)
        .values({ merchant, categoryId: catId, source: "gemini" })
        .onConflictDoUpdate({
          target: merchantCategories.merchant,
          set: { categoryId: catId, source: "gemini", updatedAt: new Date() },
        });
    }
    // Re-decide rows whose merchant Gemini just resolved.
    for (const r of rows) {
      if (!r.id || decided.has(r.id)) continue;
      if (r.merchant && cache.has(r.merchant)) {
        decided.set(r.id, { catId: cache.get(r.merchant)!, source: "gemini" });
      }
    }
  }

  // Persist decisions; everything else → Uncategorized.
  for (const r of rows) {
    if (!r.id) continue;
    const d = decided.get(r.id);
    if (d) {
      await db
        .update(transactions)
        .set({ categoryId: d.catId, categorySource: d.source })
        .where(eq(transactions.id, r.id));
    } else if (uncategorizedId) {
      await db
        .update(transactions)
        .set({ categoryId: uncategorizedId, categorySource: "default" })
        .where(eq(transactions.id, r.id));
    }
  }
}

/** Fire ntfy budget messages for newly-booked outflows in budgeted categories. */
async function notifyBudgets(rows: NewTransaction[]) {
  const outflows = rows.filter((r) => r.direction === "DBIT");
  if (outflows.length === 0 || outflows.length > MAX_NOTIFY) {
    if (outflows.length > MAX_NOTIFY) {
      await sendNtfy(`Synced ${rows.length} new transactions`, {
        title: "MWFinance",
        tags: ["arrows_counterclockwise"],
        click: env.appUrl,
      });
    }
    return;
  }

  const { rows: status } = await getMonthlyBudgetStatus();
  const byId = new Map(status.map((s) => [s.categoryId, s]));

  // Re-read the inserted rows to get their assigned category.
  const ids = outflows.map((r) => r.id!).filter(Boolean);
  if (ids.length === 0) return;
  const fresh = await db
    .select({
      id: transactions.id,
      amount: sql<number>`${transactions.amount}::float`,
      categoryId: transactions.categoryId,
      merchant: transactions.counterpartyName,
    })
    .from(transactions)
    .where(inArray(transactions.id, ids));

  for (const t of fresh) {
    if (t.categoryId == null) continue;
    const s = byId.get(t.categoryId);
    if (!s || s.budget == null || s.remaining == null) continue;
    await sendNtfy(
      budgetMessage({
        merchant: t.merchant ?? "Payment",
        spent: t.amount,
        remaining: s.remaining,
        budget: s.budget,
        category: s.name,
      }),
      {
        title: `${s.emoji} ${s.name}`,
        tags: s.remaining < 0 ? ["rotating_light"] : ["money_with_wings"],
        priority: s.remaining < 0 ? 4 : 3,
        click: env.appUrl,
      }
    );
  }
}
