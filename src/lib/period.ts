import { db } from "@/db";
import { transactions } from "@/db/schema";
import { and, asc, desc, eq, gt, lte } from "drizzle-orm";

/**
 * Salary-cycle period.
 *
 * The budget "month" runs from one salary to the next, not the calendar month.
 * Salary is the transaction whose normalized merchant is exactly SALARY_MERCHANT
 * (only real pay counts as a boundary, not Swish/refunds/other income).
 *
 *   period = [ last salary on/before ref , next salary )
 *
 * The current, ongoing period has no next salary yet -> `to` is null (open),
 * meaning "everything since the last salary up to now". When there is no salary
 * transaction at all we fall back to the calendar month so the UI still works.
 */
const SALARY_MERCHANT = "L\u00d6N";

export interface Cycle {
  from: string; // YYYY-MM-DD, salary date (inclusive)
  to: string | null; // YYYY-MM-DD, day before next salary (inclusive); null = ongoing
  label: string;
  ym: string; // from's YYYY-MM, used for adjustment keying
  isSalaryCycle: boolean; // false when we fell back to the calendar month
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(isoStr: string): string {
  return new Date(isoStr + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function addDays(isoStr: string, days: number): string {
  const d = new Date(isoStr + "T00:00:00Z");
  return iso(new Date(d.getTime() + days * 86400_000));
}

function calendarMonth(ref: Date): Cycle {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const from = iso(new Date(Date.UTC(y, m, 1)));
  const to = iso(new Date(Date.UTC(y, m + 1, 0)));
  const label = new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { from, to, label, ym: from.slice(0, 7), isSalaryCycle: false };
}

/** Resolve the salary cycle that contains `ref` (defaults to today). */
export async function getSalaryCycle(ref = new Date()): Promise<Cycle> {
  const refIso = iso(ref);

  const [start] = await db
    .select({ d: transactions.bookingDate })
    .from(transactions)
    .where(
      and(
        eq(transactions.merchant, SALARY_MERCHANT),
        lte(transactions.bookingDate, refIso)
      )
    )
    .orderBy(desc(transactions.bookingDate))
    .limit(1);

  if (!start?.d) return calendarMonth(ref);
  const from = start.d;

  const [next] = await db
    .select({ d: transactions.bookingDate })
    .from(transactions)
    .where(
      and(
        eq(transactions.merchant, SALARY_MERCHANT),
        gt(transactions.bookingDate, from)
      )
    )
    .orderBy(asc(transactions.bookingDate))
    .limit(1);

  const to = next?.d ? addDays(next.d, -1) : null;
  const label = `${fmt(from)} \u2013 ${to ? fmt(to) : "now"}`;
  return { from, to, label, ym: from.slice(0, 7), isSalaryCycle: true };
}