import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";

export interface CategoryBudget {
  categoryId: number;
  name: string;
  emoji: string;
  color: string;
  budget: number | null;
  spent: number; // positive kr spent this period
  remaining: number | null;
  pct: number | null; // 0..1+ ; null when no budget
}

/** First and last day (inclusive) of a month as YYYY-MM-DD. */
export function monthRange(d = new Date()): { from: string; to: string; label: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: iso(from), to: iso(to), label };
}

/**
 * Per-category spending vs budget for the given month. Spending = sum of
 * outflows (signed < 0) booked within the range. Income/Transfers still appear
 * but with spent from their outflows only.
 */
export async function getMonthlyBudgetStatus(month = new Date()): Promise<{
  label: string;
  rows: CategoryBudget[];
  totalSpent: number;
  totalBudget: number;
}> {
  const { from, to, label } = monthRange(month);

  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      emoji: categories.emoji,
      color: categories.color,
      budget: sql<number | null>`${categories.budgetMonthly}::float`,
      spent: spentExpr,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, categories.id),
        gte(transactions.bookingDate, from),
        lte(transactions.bookingDate, to)
      )
    )
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const out: CategoryBudget[] = rows.map((r) => {
    const budget = r.budget ?? null;
    const spent = r.spent ?? 0;
    const remaining = budget == null ? null : budget - spent;
    const pct = budget == null || budget === 0 ? null : spent / budget;
    return {
      categoryId: r.categoryId,
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      budget,
      spent,
      remaining,
      pct,
    };
  });

  const totalSpent = out.reduce((s, r) => s + r.spent, 0);
  const totalBudget = out.reduce((s, r) => s + (r.budget ?? 0), 0);
  return { label, rows: out, totalSpent, totalBudget };
}
