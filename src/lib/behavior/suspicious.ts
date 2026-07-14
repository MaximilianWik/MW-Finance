import { db } from "@/db";
import { transactions, recurringPayments, categories } from "@/db/schema";
import { eq, sql, and, isNotNull, inArray, notInArray } from "drizzle-orm";
import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";
import type { NewTransaction } from "@/db/schema";

/**
 * Flags newly-inserted DBIT rows that look off.
 *
 * Recurring-aware rules (checked first, using recurring_payments):
 *   (r1) Fixed recurring merchant whose charge deviates > RECURRING_DEVIATION
 *        from the known amount → "recurring changed".
 *   (r2) Variable-price recurring (electricity etc.): the amount-spike check is
 *        skipped (variability is expected), but a gross outlier beyond
 *        VARIABLE_OUTLIER_FACTOR × the typical amount still trips.
 *
 * Generic rules (for non-recurring merchants):
 *   (a) Merchant never seen before AND amount > NEW_MERCHANT_FACTOR × your
 *       overall median transaction size.
 *   (b) Merchant seen before AND this amount > MERCHANT_SPIKE_FACTOR × the
 *       merchant's own median.
 *
 * Fires a priority-5 ntfy per flagged transaction and stamps
 * `flagged_reason` on the row.
 */

const NEW_MERCHANT_FACTOR = 2;
const MERCHANT_SPIKE_FACTOR = 3;
const RECURRING_DEVIATION = 0.35;    // ±35% off the known recurring amount
const VARIABLE_OUTLIER_FACTOR = 3;   // gross outlier even for variable-price recurrings
const GLOBAL_LOOKBACK_DAYS = 180;

// Everyday categories whose spend is inherently variable (a 500 kr weekly shop
// vs a 120 kr top-up is normal, not an anomaly). Rows in these categories are
// never flagged, regardless of merchant novelty or amount spikes.
const EXEMPT_CATEGORIES = new Set<string>(["Groceries"]);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export interface Flagged {
  id: number;
  merchant: string;
  amount: number;
  reason: string;
}

export async function flagSuspicious(
  rows: NewTransaction[],
  onLog?: (line: string) => void
): Promise<Flagged[]> {
  const dbits = rows
    .filter((r) => r.direction === "DBIT" && r.id != null && r.merchant)
    .map((r) => ({
      id: r.id as number,
      merchant: r.merchant as string,
      amount: Number(r.amount),
    }));
  if (dbits.length === 0) return [];

  // Global median across recent history.
  const from = isoDaysAgo(GLOBAL_LOOKBACK_DAYS);
  const [globalRow] = await db
    .select({
      median: sql<number | null>`percentile_cont(0.5) within group (order by ${transactions.amount}::float)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.direction, "DBIT"),
        sql`${transactions.bookingDate} >= ${from}`
      )
    );
  const globalMedian = globalRow?.median ?? 0;

  // Per-merchant median (only for merchants we've seen before this insert).
  const merchants = Array.from(new Set(dbits.map((r) => r.merchant)));
  const newIds = new Set(dbits.map((r) => r.id));
  const perMerchant = new Map<string, { median: number; count: number }>();

  if (merchants.length > 0) {
    // Exclude the just-inserted rows so a first-ever occurrence isn't compared
    // against itself.
    const newIdArr = Array.from(newIds);
    const rows = await db
      .select({
        merchant: transactions.merchant,
        median: sql<number>`percentile_cont(0.5) within group (order by ${transactions.amount}::float)`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.direction, "DBIT"),
          inArray(transactions.merchant, merchants),
          isNotNull(transactions.merchant),
          newIdArr.length > 0
            ? notInArray(transactions.id, newIdArr)
            : sql`true`
        )
      )
      .groupBy(transactions.merchant);
    for (const row of rows) {
      if (row.merchant) perMerchant.set(row.merchant, { median: row.median, count: row.count });
    }
  }

  const flagged: Flagged[] = [];

  // Known recurring payments for these merchants — enables precise deviation
  // checks and correct handling of variable-price recurrings.
  const recurringMap = new Map<string, { amount: number; variable: boolean }>();
  if (merchants.length > 0) {
    const recRows = await db
      .select({
        merchant: recurringPayments.merchant,
        amount: sql<number>`${recurringPayments.amount}::float`,
        variable: recurringPayments.variableAmount,
      })
      .from(recurringPayments)
      .where(and(eq(recurringPayments.active, true), inArray(recurringPayments.merchant, merchants)));
    for (const r of recRows) recurringMap.set(r.merchant, { amount: r.amount, variable: r.variable });
  }

  // Category per candidate row. Categorization already ran earlier in the sync
  // pipeline, so categoryId is persisted; we use it to skip exempt categories.
  const catByTxId = new Map<number, string | null>();
  {
    const catRows = await db
      .select({ id: transactions.id, category: categories.name })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(inArray(transactions.id, Array.from(newIds)));
    for (const c of catRows) catByTxId.set(c.id, c.category);
  }

  for (const r of dbits) {
    // Skip inherently-variable everyday spend (groceries etc.).
    const catName = catByTxId.get(r.id);
    if (catName && EXEMPT_CATEGORIES.has(catName)) continue;

    let reason: string | null = null;
    const rec = recurringMap.get(r.merchant);

    if (rec && rec.amount > 0) {
      // Recurring-aware path.
      if (rec.variable) {
        if (r.amount > VARIABLE_OUTLIER_FACTOR * rec.amount) {
          reason = `${r.merchant} variable spike · ${Math.round(r.amount)} kr (usually ~${Math.round(rec.amount)} kr, variable)`;
        }
      } else {
        const dev = Math.abs(r.amount - rec.amount) / rec.amount;
        if (dev > RECURRING_DEVIATION) {
          reason = `${r.merchant} recurring changed · ${Math.round(r.amount)} kr (usually ${Math.round(rec.amount)} kr)`;
        }
      }
    } else {
      // Generic path (non-recurring merchants).
      const prior = perMerchant.get(r.merchant);
      if (!prior || prior.count === 0) {
        if (globalMedian > 0 && r.amount > NEW_MERCHANT_FACTOR * globalMedian) {
          reason = `New merchant · ${Math.round(r.amount)} kr (>${NEW_MERCHANT_FACTOR}× your typical spend)`;
        }
      } else if (prior.median > 0 && r.amount > MERCHANT_SPIKE_FACTOR * prior.median) {
        reason = `${r.merchant} spike · ${Math.round(r.amount)} kr (>${MERCHANT_SPIKE_FACTOR}× the usual ${Math.round(prior.median)} kr)`;
      }
    }

    if (!reason) continue;

    await db
      .update(transactions)
      .set({ flaggedReason: reason })
      .where(eq(transactions.id, r.id));

    await sendNtfy(reason, {
      title: "Unusual charge",
      tags: ["rotating_light"],
      priority: 5,
      click: env.appUrl + "/transactions",
    });

    onLog?.(`       [!] ANOMALY · ${reason}`);

    flagged.push({ id: r.id, merchant: r.merchant, amount: r.amount, reason });
  }

  return flagged;
}
