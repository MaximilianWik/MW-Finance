import { db } from "@/db";
import { transactions, categories, settings } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getPrimaryGoal } from "@/lib/savings";

// Assumed full-time month for salary → hourly derivation (40h/wk × 4).
const HOURS_PER_MONTH = 160;

// Same salary heuristic as src/lib/period.ts: CRDT Income in this range.
const SALARY_MIN = 18_000;
const SALARY_MAX = 30_000;

/** Median of a numeric list (0 for empty). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Effective hourly rate used to translate spend into hours-of-work.
 *
 *   1. settings.hourly_rate when the user has set one.
 *   2. Otherwise derive: median of the last 12 detected salary deposits ÷ 160h.
 *   3. null when neither is available (chips then hide).
 *
 * `source` lets the config UI explain where the number came from.
 */
export async function getHourlyRate(): Promise<{
  rate: number | null;
  source: "manual" | "derived" | "none";
  derived: number | null;
}> {
  const [s] = await db
    .select({ hourly: sql<number | null>`${settings.hourlyRate}::float` })
    .from(settings)
    .limit(1);

  const derived = await deriveHourlyFromSalary();

  if (s?.hourly != null && s.hourly > 0) {
    return { rate: s.hourly, source: "manual", derived };
  }
  if (derived != null && derived > 0) {
    return { rate: derived, source: "derived", derived };
  }
  return { rate: null, source: "none", derived };
}

/** Median detected salary ÷ 160h, or null when no salary is on record. */
export async function deriveHourlyFromSalary(): Promise<number | null> {
  const rows = await db
    .select({ amount: sql<number>`${transactions.amount}::float` })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.direction, "CRDT"),
        eq(categories.name, "Income"),
        sql`${transactions.amount}::float between ${SALARY_MIN} and ${SALARY_MAX}`
      )
    )
    .orderBy(desc(transactions.bookingDate))
    .limit(12);

  if (rows.length === 0) return null;
  const m = median(rows.map((r) => r.amount));
  return m > 0 ? m / HOURS_PER_MONTH : null;
}

/**
 * Bundle for the ledger cost chips (TxChips): effective hourly rate + the
 * primary goal's remaining distance to target. Both nullable — chips hide
 * when the data isn't there.
 */
export async function getChipContext(): Promise<{
  hourlyRate: number | null;
  goal: { name: string; remaining: number } | null;
}> {
  const [{ rate }, primary] = await Promise.all([getHourlyRate(), getPrimaryGoal()]);
  const goal =
    primary != null
      ? { name: primary.name, remaining: Math.max(0, primary.target - primary.current) }
      : null;
  return { hourlyRate: rate, goal };
}
