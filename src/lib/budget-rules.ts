import { db } from "@/db";
import { categories, recurringPayments } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Budget rules shared by AI recalibration, adaptive redistribution and the
 * budget editor.
 *
 * LOCKED categories are never changed automatically: not by recalibration and
 * not by adaptive redistribution (neither as donor nor as recipient).
 * Savings / Investments stay editable by hand; Bills is driven by the bills
 * checklist (active recurring payments) and can't be edited at all.
 */

export const BILLS_CATEGORY = "Bills & Utilities";

export const LOCKED_CATEGORIES = new Set([
  "Income",
  "Savings",
  "Investments",
  "Transfers",
  "Swish",
  "Uncategorized",
  BILLS_CATEGORY,
]);

export function isLocked(name: string): boolean {
  return LOCKED_CATEGORIES.has(name);
}

/** Monthly cost of one recurring payment, whatever its cadence. */
export function monthlyEquivalent(amount: number, cadence: string, cadenceDays: number | null): number {
  if (cadence === "weekly") return (amount * 52) / 12;
  if (cadence === "yearly") return amount / 12;
  if (cadenceDays && cadenceDays > 0 && cadence !== "monthly") return (amount * 30.44) / cadenceDays;
  return amount;
}

/** Σ monthly cost of the active recurring payments in Bills & Utilities (the bills checklist). */
export async function getBillsTotal(): Promise<{ categoryId: number | null; total: number; count: number }> {
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, BILLS_CATEGORY))
    .limit(1);
  if (!cat) return { categoryId: null, total: 0, count: 0 };

  const recs = await db
    .select({
      amount: sql<number>`${recurringPayments.amount}::float`,
      cadence: recurringPayments.cadence,
      cadenceDays: recurringPayments.cadenceDays,
    })
    .from(recurringPayments)
    .where(and(eq(recurringPayments.active, true), eq(recurringPayments.categoryId, cat.id)));

  const total = recs.reduce((s, r) => s + monthlyEquivalent(r.amount, r.cadence, r.cadenceDays), 0);
  return { categoryId: cat.id, total: Math.round(total), count: recs.length };
}

/**
 * Keep the Bills & Utilities budget equal to the bills checklist total.
 * Writes only when it differs. Stamps budgetSource='bills'. No bills found →
 * the stored budget is left as-is (nothing to lock it to yet).
 */
export async function syncBillsBudget(): Promise<{ changed: boolean; total: number; count: number }> {
  const { categoryId, total, count } = await getBillsTotal();
  if (categoryId == null || count === 0) return { changed: false, total, count };

  const [cur] = await db
    .select({ budget: sql<number | null>`${categories.budgetMonthly}::float`, source: categories.budgetSource })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (cur && cur.budget === total && cur.source === "bills") return { changed: false, total, count };

  await db
    .update(categories)
    .set({ budgetMonthly: String(total), budgetSource: "bills" })
    .where(eq(categories.id, categoryId));
  return { changed: true, total, count };
}
