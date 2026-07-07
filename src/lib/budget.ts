import { db } from "@/db";
import { transactions, categories, budgetAdjustments } from "@/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";

export interface CategoryBudget {
  categoryId: number;
  name: string;
  color: string;
  budget: number | null; // effective budget (base + adjustments), null when unbudgeted
  baseBudget: number | null; // raw categories.budget_monthly
  adjustment: number; // sum of adjustments this month
  spent: number; // positive kr spent this period
  remaining: number | null;
  pct: number | null; // 0..1+ ; null when no budget
}

/** First and last day (inclusive) of a month as YYYY-MM-DD. */
export function monthRange(d = new Date()): { from: string; to: string; label: string; ym: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const ym = from.toISOString().slice(0, 7);
  return { from: iso(from), to: iso(to), label, ym };
}

/**
 * Per-category spending vs budget for the given month. Spending = sum of
 * outflows (signed < 0) booked within the range. Income/Transfers still appear
 * but with spent from their outflows only.
 *
 * The `budget` field is the EFFECTIVE budget (base + adaptive adjustments),
 * so all downstream UI shows live-adjusted numbers.
 */
export async function getMonthlyBudgetStatus(month = new Date()): Promise<{
  label: string;
  ym: string;
  rows: CategoryBudget[];
  totalSpent: number;
  totalBudget: number;
}> {
  const { from, to, label, ym } = monthRange(month);

  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
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

  // Adjustments this month.
  const adjRows = await db
    .select({
      categoryId: budgetAdjustments.categoryId,
      total: sql<number>`coalesce(sum(${budgetAdjustments.delta}::float), 0)::float`,
    })
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.month, ym))
    .groupBy(budgetAdjustments.categoryId);
  const adjMap = new Map(adjRows.map((r) => [r.categoryId, r.total]));

  const out: CategoryBudget[] = rows.map((r) => {
    const baseBudget = r.budget ?? null;
    const adjustment = adjMap.get(r.categoryId) ?? 0;
    const budget =
      baseBudget == null ? (adjustment !== 0 ? adjustment : null) : baseBudget + adjustment;
    const spent = r.spent ?? 0;
    const remaining = budget == null ? null : budget - spent;
    const pct = budget == null || budget === 0 ? null : spent / budget;
    return {
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      budget,
      baseBudget,
      adjustment,
      spent,
      remaining,
      pct,
    };
  });

  // Transfers between own accounts are not spending -> excluded from the total.
  const totalSpent = out.reduce((s, r) => s + (r.name === "Transfers" ? 0 : r.spent), 0);
  const totalBudget = out.reduce((s, r) => s + (r.budget ?? 0), 0);
  return { label, ym, rows: out, totalSpent, totalBudget };
}

/** Current ISO week (Mon–Sun) as YYYY-MM-DD bounds + a compact label. */
export function weekRange(d = new Date()): { from: string; to: string; label: string } {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (day + 6) % 7; // days since Monday
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon));
  const sun = new Date(mon.getTime() + 6 * 86400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return { from: iso(mon), to: iso(sun), label: `${fmt(mon)} – ${fmt(sun)}` };
}

export interface WeeklyBudget {
  categoryId: number;
  name: string;
  color: string;
  budget: number | null; // weekly budget
  spent: number;
  remaining: number | null;
  pct: number | null;
}

/**
 * Per-category spending vs WEEKLY budget for the current ISO week. Only
 * categories with a weekly budget set are returned (others have no weekly
 * cadence to track).
 */
export async function getWeeklyBudgetStatus(week = new Date()): Promise<{
  label: string;
  rows: WeeklyBudget[];
  totalSpent: number;
  totalBudget: number;
}> {
  const { from, to, label } = weekRange(week);

  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      budget: sql<number | null>`${categories.budgetWeekly}::float`,
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

  const out: WeeklyBudget[] = rows
    .filter((r) => r.budget != null)
    .map((r) => {
      const budget = r.budget ?? null;
      const spent = r.spent ?? 0;
      const remaining = budget == null ? null : budget - spent;
      const pct = budget == null || budget === 0 ? null : spent / budget;
      return { categoryId: r.categoryId, name: r.name, color: r.color, budget, spent, remaining, pct };
    });

  const totalSpent = out.reduce((s, r) => s + r.spent, 0);
  const totalBudget = out.reduce((s, r) => s + (r.budget ?? 0), 0);
  return { label, rows: out, totalSpent, totalBudget };
}
