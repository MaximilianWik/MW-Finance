import { db } from "@/db";
import { categories, recurringPayments, transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getSalaryCycle, getAllSalaryCycles } from "@/lib/period";
import { median } from "@/lib/budget-baseline";

/**
 * Budget rules shared by AI recalibration, adaptive redistribution and the
 * budget editor.
 *
 * LOCKED categories are never changed automatically: not by recalibration and
 * not by adaptive redistribution (neither as donor nor as recipient).
 * Savings / Investments stay editable by hand; Bills is driven by the bills
 * checklist (active recurring payments) and can't be edited at all.
 *
 * Zero-based: BUFFER holds whatever part of the cycle's income no other
 * category is assigned, so every krona has a job. It is computed, never edited,
 * and it is the first donor when adaptive budgeting covers an overshoot.
 */

export const BILLS_CATEGORY = "Bills & Utilities";
export const BUFFER_CATEGORY = "Buffer";
export const INCOME_CATEGORY = "Income";

/** Not spending: never shown in, or summed into, the budget. */
export const NOT_BUDGETED = new Set([INCOME_CATEGORY, "Transfers"]);

/** Can't be deleted (mirrored in the client). */
export const UNDELETABLE = new Set(["Uncategorized", "Income", "Transfers", "Savings", BILLS_CATEGORY, BUFFER_CATEGORY]);

export const LOCKED_CATEGORIES = new Set([
  "Income",
  "Savings",
  "Investments",
  "Transfers",
  "Swish",
  "Uncategorized",
  BILLS_CATEGORY,
  BUFFER_CATEGORY,
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

/**
 * Income to budget for the current cycle: the income actually received in it
 * (the salary that opened it), else the median income of the last finished
 * cycles (before the salary lands).
 */
export async function getCycleIncome(): Promise<{ income: number; source: "cycle" | "median" | "none" }> {
  const incomeIn = async (from: string, to: string) => {
    const [r] = await db
      .select({ total: sql<number>`coalesce(sum(${transactions.signed}::float), 0)::float` })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(categories.name, INCOME_CATEGORY),
          sql`${transactions.signed} > 0`,
          gte(transactions.bookingDate, from),
          lte(transactions.bookingDate, to)
        )
      );
    return r?.total ?? 0;
  };

  const today = new Date().toISOString().slice(0, 10);
  const cycle = await getSalaryCycle();
  const now = await incomeIn(cycle.from, cycle.to ?? today);
  if (now > 0) return { income: Math.round(now), source: "cycle" };

  const finished = (await getAllSalaryCycles()).filter((c) => c.to != null).slice(0, 6);
  const past = await Promise.all(finished.map((c) => incomeIn(c.from, c.to!)));
  const m = median(past.filter((v) => v > 0));
  return m > 0 ? { income: Math.round(m), source: "median" } : { income: 0, source: "none" };
}

export interface BudgetPlan {
  income: number;
  incomeSource: "cycle" | "median" | "none";
  assigned: number; // Σ base limits of every budgeted category except Buffer
  buffer: number; // income - assigned, floored at 0
  overBy: number; // assigned - income when limits exceed income, else 0
}

/**
 * Zero-based: Buffer = income - Σ other base limits. Creates the Buffer
 * category on first use. Writes only when the value changes.
 */
export async function syncBufferBudget(): Promise<BudgetPlan> {
  const { income, source } = await getCycleIncome();
  const cats = await db
    .select({ id: categories.id, name: categories.name, base: sql<number | null>`${categories.budgetMonthly}::float`, source: categories.budgetSource })
    .from(categories);

  const assigned = Math.round(
    cats
      .filter((c) => !NOT_BUDGETED.has(c.name) && c.name !== BUFFER_CATEGORY)
      .reduce((s, c) => s + (c.base ?? 0), 0)
  );
  const plan: BudgetPlan = {
    income,
    incomeSource: source,
    assigned,
    buffer: Math.max(0, income - assigned),
    overBy: Math.max(0, assigned - income),
  };
  if (source === "none") return plan; // no income seen yet: leave Buffer alone

  const buf = cats.find((c) => c.name === BUFFER_CATEGORY);
  if (!buf) {
    await db.insert(categories).values({
      name: BUFFER_CATEGORY,
      color: "#8a9a8a",
      budgetMonthly: String(plan.buffer),
      budgetSource: "buffer",
      sort: 92,
    });
  } else if (buf.base !== plan.buffer || buf.source !== "buffer") {
    await db
      .update(categories)
      .set({ budgetMonthly: String(plan.buffer), budgetSource: "buffer" })
      .where(eq(categories.id, buf.id));
  }
  return plan;
}

/** Bills first (it changes what is assigned), then Buffer takes the rest. */
export async function syncBudgetLocks() {
  const bills = await syncBillsBudget();
  const plan = await syncBufferBudget();
  return { bills, plan };
}
