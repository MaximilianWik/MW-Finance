import { db } from "@/db";
import { transactions, categories, recurringPayments } from "@/db/schema";
import { and, gte, lte, sql, notInArray, isNull, or, eq } from "drizzle-orm";
import { getMonthlyBudgetStatus } from "@/lib/budget";

// Spend that does NOT count against uptime or the capacitor: internal transfers,
// savings moves, and any transaction whose merchant is a recognized recurring
// payment (bills, subscriptions). Bills are budgeted commitments, not daily
// discipline failures — they should never break a streak.
export const EXCLUDED_CATEGORIES = ["Transfers", "Savings"];

/** Today as YYYY-MM-DD (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between two ISO dates, inclusive of both ends. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86400_000) + 1;
}

/** Shift an ISO date by n days. */
export function shiftIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + n * 86400_000).toISOString().slice(0, 10);
}

/** Monday (UTC) of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const backToMon = dow === 0 ? 6 : dow - 1;
  return shiftIso(iso, -backToMon);
}

/** ISO week key, e.g. "2026-W28". */
export function isoWeek(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export interface PaceInfo {
  pace: number;       // allowed spend per clean day (kr)
  totalBudget: number;
  cycleDays: number;
  from: string;
  to: string | null;
}

/**
 * Daily spending pace = total monthly budget ÷ salary-cycle length. A day is
 * "clean" when its counted spend stays at or below this.
 */
export async function getDailyPace(): Promise<PaceInfo> {
  const status = await getMonthlyBudgetStatus();
  // Open cycles (no next salary yet) approximate a month so pace doesn't spike.
  const cycleDays = status.to ? daysBetween(status.from, status.to) : 30;
  const pace = cycleDays > 0 ? status.totalBudget / cycleDays : status.totalBudget;
  return {
    pace,
    totalBudget: status.totalBudget,
    cycleDays: Math.max(1, cycleDays),
    from: status.from,
    to: status.to,
  };
}

/**
 * Map of YYYY-MM-DD → counted spend (positive kr) between two dates.
 * Excluded: transfers, savings, and any transaction whose merchant is a
 * recognized active recurring payment (bills, subscriptions). Missing days = 0.
 */
export async function getDailySpendMap(
  fromIso: string,
  toIso: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      day: transactions.bookingDate,
      spent: sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(
      recurringPayments,
      and(
        eq(transactions.merchant, recurringPayments.merchant),
        eq(recurringPayments.active, true)
      )
    )
    .where(
      and(
        gte(transactions.bookingDate, fromIso),
        lte(transactions.bookingDate, toIso),
        or(isNull(categories.name), notInArray(categories.name, EXCLUDED_CATEGORIES)),
        isNull(recurringPayments.id)  // exclude recognized recurring payments
      )
    )
    .groupBy(transactions.bookingDate);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.day) map.set(r.day, r.spent);
  }
  return map;
}
