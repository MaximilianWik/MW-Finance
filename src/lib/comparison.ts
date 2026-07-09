import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAllSalaryCycles } from "@/lib/period";

function monthRange(month: string) {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** ISO week (Mon–Sun) bounds for the week containing `d`, offset by `weeksAgo`. */
function weekBounds(d: Date, weeksAgo = 0): { from: string; to: string } {
  const day = d.getUTCDay();
  const diffToMon = (day + 6) % 7;
  const mon = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon - weeksAgo * 7)
  );
  const sun = new Date(mon.getTime() + 6 * 86400_000);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

export interface CategoryComparison {
  categoryId: number;
  name: string;
  color: string;
  spentThis: number;
  spentPrev: number;
  deltaKr: number; // spentThis - spentPrev
  deltaPct: number | null; // null when spentPrev === 0
}

export interface MonthComparison {
  month: string; // current
  previousMonth: string;
  rows: CategoryComparison[];
  totalThis: number;
  totalPrev: number;
  totalDelta: number;
  totalDeltaPct: number | null;
}

/** Per-category spend comparison between `month` and `month - 1`. */
export async function getMonthComparison(month: string): Promise<MonthComparison> {
  const previousMonth = prevMonth(month);
  const cur = monthRange(month);
  const prev = monthRange(previousMonth);

  const spentThisExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${cur.from} and ${cur.to} then ${transactions.signed} else 0 end), 0)::float`;
  const spentPrevExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${prev.from} and ${prev.to} then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      spentThis: spentThisExpr,
      spentPrev: spentPrevExpr,
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const out: CategoryComparison[] = rows
    .filter((r) => r.name !== "Transfers")
    .map((r) => {
    const deltaKr = r.spentThis - r.spentPrev;
    const deltaPct = r.spentPrev === 0 ? null : deltaKr / r.spentPrev;
    return {
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      spentThis: r.spentThis,
      spentPrev: r.spentPrev,
      deltaKr,
      deltaPct,
    };
  });

  const totalThis = out.reduce((s, r) => s + r.spentThis, 0);
  const totalPrev = out.reduce((s, r) => s + r.spentPrev, 0);
  const totalDelta = totalThis - totalPrev;
  const totalDeltaPct = totalPrev === 0 ? null : totalDelta / totalPrev;

  return {
    month,
    previousMonth,
    rows: out,
    totalThis,
    totalPrev,
    totalDelta,
    totalDeltaPct,
  };
}

export interface WeekComparison {
  thisWeek: { from: string; to: string };
  lastWeek: { from: string; to: string };
  rows: CategoryComparison[];
  totalThis: number;
  totalPrev: number;
  totalDelta: number;
  totalDeltaPct: number | null;
}

/** Per-category spend comparison: current ISO week vs the previous ISO week. */
export async function getWeekComparison(now = new Date()): Promise<WeekComparison> {
  const thisWeek = weekBounds(now, 0);
  const lastWeek = weekBounds(now, 1);

  const spentThisExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${thisWeek.from} and ${thisWeek.to} then ${transactions.signed} else 0 end), 0)::float`;
  const spentPrevExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${lastWeek.from} and ${lastWeek.to} then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      spentThis: spentThisExpr,
      spentPrev: spentPrevExpr,
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const out: CategoryComparison[] = rows
    .filter((r) => r.name !== "Transfers")
    .map((r) => {
    const deltaKr = r.spentThis - r.spentPrev;
    const deltaPct = r.spentPrev === 0 ? null : deltaKr / r.spentPrev;
    return {
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      spentThis: r.spentThis,
      spentPrev: r.spentPrev,
      deltaKr,
      deltaPct,
    };
  });

  const totalThis = out.reduce((s, r) => s + r.spentThis, 0);
  const totalPrev = out.reduce((s, r) => s + r.spentPrev, 0);
  const totalDelta = totalThis - totalPrev;
  const totalDeltaPct = totalPrev === 0 ? null : totalDelta / totalPrev;

  return { thisWeek, lastWeek, rows: out, totalThis, totalPrev, totalDelta, totalDeltaPct };
}

/**
 * Per-category spend comparison between the current and previous salary cycle.
 * Falls back to `getMonthComparison` if fewer than 2 salary dates are detected
 * (new users, no income transactions yet).
 */
export async function getSalaryComparison(): Promise<MonthComparison> {
  const cycles = await getAllSalaryCycles();

  if (cycles.length < 2) {
    return getMonthComparison(new Date().toISOString().slice(0, 7));
  }

  const cur  = cycles[0]; // most recent — open (to = null) or just closed
  const prev = cycles[1]; // previous — always complete
  const today = new Date().toISOString().slice(0, 10);
  const curTo  = cur.to  ?? today;
  const prevTo = prev.to!;

  const spentThisExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${cur.from} and ${curTo} then ${transactions.signed} else 0 end), 0)::float`;
  const spentPrevExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${prev.from} and ${prevTo} then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name:       categories.name,
      color:      categories.color,
      spentThis:  spentThisExpr,
      spentPrev:  spentPrevExpr,
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const out: CategoryComparison[] = rows
    .filter((r) => r.name !== "Transfers")
    .map((r) => {
      const deltaKr  = r.spentThis - r.spentPrev;
      const deltaPct = r.spentPrev === 0 ? null : deltaKr / r.spentPrev;
      return { categoryId: r.categoryId, name: r.name, color: r.color, spentThis: r.spentThis, spentPrev: r.spentPrev, deltaKr, deltaPct };
    });

  const totalThis      = out.reduce((s, r) => s + r.spentThis, 0);
  const totalPrev      = out.reduce((s, r) => s + r.spentPrev, 0);
  const totalDelta     = totalThis - totalPrev;
  const totalDeltaPct  = totalPrev === 0 ? null : totalDelta / totalPrev;

  return {
    month:         cur.label,   // e.g. "25 May – now"
    previousMonth: prev.label,  // e.g. "25 Apr – 24 May"
    rows: out,
    totalThis,
    totalPrev,
    totalDelta,
    totalDeltaPct,
  };
}
