import { db } from "@/db";
import { transactions, categories, merchantCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ruleCategory, geminiCategorize } from "@/lib/categorize";
import { isSelfTransfer } from "@/lib/transfers";

/**
 * Shared categorization engine: rules → merchant cache → Gemini, with live
 * per-transaction log emission. Used both by the sync pipeline (fresh rows) and
 * the ledger "categorize" action (existing backlog).
 */

export interface CatRow {
  id: number;
  merchant: string | null;
  counterpartyName: string | null;
  remittance: string | null;
  mcc: string | null;
  direction: string;
}

export interface CatStats {
  rule: number;
  cache: number;
  gemini: number;
  def: number;
}

const LINE_CAP = 60; // avoid flooding the console on large batches

/** Apply rules → merchant cache → Gemini to the given rows and persist. */
export async function categorizeBatch(
  rows: CatRow[],
  opts: { useGemini: boolean; onLog?: (line: string) => void }
): Promise<CatStats> {
  const push = opts.onLog ?? (() => {});

  const cats = await db.select().from(categories);
  const nameToId = new Map(cats.map((c) => [c.name, c.id]));
  const idToName = new Map(cats.map((c) => [c.id, c.name]));
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
    // Highest priority: transfers between the user's own accounts.
    if (
      isSelfTransfer({
        counterpartyName: r.counterpartyName,
        remittance: r.remittance,
        merchant: r.merchant,
      })
    ) {
      const transfersId = nameToId.get("Transfers");
      if (transfersId) {
        decided.set(r.id, { catId: transfersId, source: "rule" });
        continue;
      }
    }
    const ruleName = ruleCategory({
      merchant: r.merchant,
      mcc: r.mcc,
      remittance: r.remittance,
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

  // Second pass: Gemini for unknown merchants.
  if (opts.useGemini && needGemini.length > 0) {
    const uniq = Array.from(new Set(needGemini));
    push(`[AI]   asking Gemini about ${uniq.length} unknown merchant(s)…`);
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
      if (decided.has(r.id)) continue;
      if (r.merchant && cache.has(r.merchant)) {
        decided.set(r.id, { catId: cache.get(r.merchant)!, source: "gemini" });
      }
    }
  }

  // Persist decisions; everything else -> Uncategorized.
  let ruleCount = 0, cacheCount = 0, geminiCount = 0, defCount = 0;
  let emitted = 0;
  const emitLine = (merchant: string, catName: string, source: string, anomaly = false) => {
    if (emitted < LINE_CAP) {
      const glyph = anomaly ? "[!]" : "[✓]";
      push(`       ${glyph} ${merchant.slice(0, 40)} → ${catName} (${source})`);
    } else if (emitted === LINE_CAP) {
      push(`       … ${rows.length - LINE_CAP} more`);
    }
    emitted++;
  };

  for (const r of rows) {
    const merchant = (r.merchant ?? r.counterpartyName ?? "?").toString();
    const d = decided.get(r.id);
    if (d) {
      if (d.source === "rule") ruleCount++;
      else if (d.source === "cache") cacheCount++;
      else geminiCount++;
      await db
        .update(transactions)
        .set({ categoryId: d.catId, categorySource: d.source })
        .where(eq(transactions.id, r.id));
      emitLine(merchant, idToName.get(d.catId) ?? "?", d.source);
    } else if (uncategorizedId) {
      defCount++;
      await db
        .update(transactions)
        .set({ categoryId: uncategorizedId, categorySource: "default" })
        .where(eq(transactions.id, r.id));
      emitLine(merchant, "Uncategorized", "default");
    }
  }

  return { rule: ruleCount, cache: cacheCount, gemini: geminiCount, def: defCount };
}
