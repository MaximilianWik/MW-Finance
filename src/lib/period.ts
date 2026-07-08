import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { and, asc, desc, eq, gt, isNotNull, lte, sql } from "drizzle-orm";

/**
 * Salary-cycle period.
 *
 * A "salary" transaction is any CRDT Income entry in the amount range
 * SALARY_MIN..SALARY_MAX. This is more robust than matching a specific
 * merchant name because the counterparty can vary (employer name, LÖN
 * shorthand, etc.).
 *
 *   period = [ most recent salary on/before ref , next salary )
 *
 * The current open period (no next salary yet) has to=null meaning
 * "everything since the last salary up to now."
 * Falls back to the calendar month when no salary transaction exists.
 */
const SALARY_MIN = 18_000;
const SALARY_MAX = 30_000;

export interface Cycle {
  from: string;       // YYYY-MM-DD, salary date (inclusive)
  to: string | null;  // YYYY-MM-DD, day before next salary (inclusive); null = ongoing
  label: string;
  ym: string;         // from's YYYY-MM, used for adjustment keying
  isSalaryCycle: boolean;
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

/**
 * Condition fragment that matches salary transactions:
 * CRDT, Income category, amount in the salary range.
 */
function salaryWhere() {
  return and(
    eq(transactions.direction, "CRDT"),
    eq(categories.name, "Income"),
    sql`${transactions.amount}::float between ${SALARY_MIN} and ${SALARY_MAX}`
  );
}

/** Resolve the salary cycle that contains `ref` (defaults to today). */
export async function getSalaryCycle(ref = new Date()): Promise<Cycle> {
  const refIso = iso(ref);

  const [start] = await db
    .select({ d: transactions.bookingDate })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(salaryWhere(), lte(transactions.bookingDate, refIso)))
    .orderBy(desc(transactions.bookingDate))
    .limit(1);

  if (!start?.d) return calendarMonth(ref);
  const from = start.d;

  const [next] = await db
    .select({ d: transactions.bookingDate })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(salaryWhere(), gt(transactions.bookingDate, from)))
    .orderBy(asc(transactions.bookingDate))
    .limit(1);

  const to = next?.d ? addDays(next.d, -1) : null;
  const label = `${fmt(from)} \u2013 ${to ? fmt(to) : "now"}`;
  return { from, to, label, ym: from.slice(0, 7), isSalaryCycle: true };
}

/** Every salary cycle (latest first) for the ledger period filter. */
export async function getAllSalaryCycles(): Promise<Cycle[]> {
  const rows = await db
    .select({ d: transactions.bookingDate })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(salaryWhere(), isNotNull(transactions.bookingDate)))
    .orderBy(desc(transactions.bookingDate));

  const uniq = [...new Set(rows.map((r) => r.d).filter((d): d is string => !!d))];

  return uniq.map((from, i) => {
    const nextSalary = i > 0 ? uniq[i - 1] : null; // later date, since desc order
    const to = nextSalary ? addDays(nextSalary, -1) : null;
    const label = `${fmt(from)} \u2013 ${to ? fmt(to) : "now"}`;
    return { from, to, label, ym: from.slice(0, 7), isSalaryCycle: true };
  });
}