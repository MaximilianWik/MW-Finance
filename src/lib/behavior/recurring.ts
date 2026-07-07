import { db } from "@/db";
import { transactions, recurringPayments } from "@/db/schema";
import { and, eq, sql, isNotNull } from "drizzle-orm";

/**
 * Recurring-payment detection.
 *
 * Groups historical DBIT transactions by normalized merchant, then looks for
 * groups that:
 *   • have ≥ MIN_OCCURRENCES bookings within LOOKBACK_DAYS
 *   • have consistent amounts (spread ≤ AMOUNT_TOLERANCE)
 *   • have consistent cadence — the median gap in days must fit one of the
 *     known cadence buckets (weekly / monthly / yearly) within a small delta
 *
 * Detected recurrings are upserted on merchant. Existing rows keep their
 * category assignment.
 */

const MIN_OCCURRENCES = 3;
const LOOKBACK_DAYS = 400; // capture ~1 year of yearly renewals
const AMOUNT_TOLERANCE = 0.15; // ±15% around the median amount
const CADENCE_BUCKETS: Array<{ name: "weekly" | "monthly" | "yearly"; days: number; tol: number }> = [
  { name: "weekly", days: 7, tol: 2 },
  { name: "monthly", days: 30, tol: 6 },
  { name: "yearly", days: 365, tol: 20 },
];

interface Occurrence {
  bookingDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  categoryId: number | null;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function daysBetween(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((tb - ta) / 86400_000);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + days * 86400_000).toISOString().slice(0, 10);
}

interface DetectedRecurring {
  merchant: string;
  amount: number;
  currency: string;
  cadence: "weekly" | "monthly" | "yearly";
  cadenceDays: number;
  lastDate: string;
  nextDate: string;
  occurrences: number;
  categoryId: number | null;
}

/** Returns detected recurrings without touching the DB — pure over the input. */
export function detectRecurrings(byMerchant: Map<string, Occurrence[]>): DetectedRecurring[] {
  const out: DetectedRecurring[] = [];

  for (const [merchant, occs] of byMerchant.entries()) {
    if (occs.length < MIN_OCCURRENCES) continue;

    // Sort ascending by date.
    const sorted = [...occs].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));

    // Amount consistency: median ± tolerance.
    const amounts = sorted.map((o) => o.amount);
    const medAmount = median(amounts);
    if (medAmount <= 0) continue;
    const spread = amounts.every(
      (a) => Math.abs(a - medAmount) / medAmount <= AMOUNT_TOLERANCE
    );
    if (!spread) continue;

    // Gap analysis.
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].bookingDate, sorted[i].bookingDate));
    }
    if (gaps.length === 0) continue;
    const medGap = median(gaps);

    const bucket = CADENCE_BUCKETS.find(
      (b) => Math.abs(medGap - b.days) <= b.tol
    );
    if (!bucket) continue;

    // Reject high-variance groups (stddev / median > 0.4).
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance =
      gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    const stddev = Math.sqrt(variance);
    if (stddev / medGap > 0.4) continue;

    const lastDate = sorted[sorted.length - 1].bookingDate;
    const nextDate = addDays(lastDate, Math.round(medGap));
    // Prefer the most recent non-null categoryId (user may have manually
    // recategorized more recent occurrences).
    let categoryId: number | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].categoryId != null) {
        categoryId = sorted[i].categoryId;
        break;
      }
    }

    out.push({
      merchant,
      amount: medAmount,
      currency: sorted[0].currency,
      cadence: bucket.name,
      cadenceDays: Math.round(medGap),
      lastDate,
      nextDate,
      occurrences: sorted.length,
      categoryId,
    });
  }

  return out;
}

/**
 * Load recent history from the DB, run detection, upsert results into
 * `recurring_payments`. Returns the detected rows.
 */
export async function detectAndPersistRecurrings(): Promise<DetectedRecurring[]> {
  const from = isoDaysAgo(LOOKBACK_DAYS);

  const rows = await db
    .select({
      merchant: transactions.merchant,
      bookingDate: transactions.bookingDate,
      amount: sql<number>`${transactions.amount}::float`,
      currency: transactions.currency,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.direction, "DBIT"),
        isNotNull(transactions.merchant),
        isNotNull(transactions.bookingDate),
        sql`${transactions.bookingDate} >= ${from}`
      )
    );

  const byMerchant = new Map<string, Occurrence[]>();
  for (const r of rows) {
    if (!r.merchant || !r.bookingDate) continue;
    const list = byMerchant.get(r.merchant) ?? [];
    list.push({
      bookingDate: r.bookingDate,
      amount: r.amount,
      currency: r.currency,
      categoryId: r.categoryId ?? null,
    });
    byMerchant.set(r.merchant, list);
  }

  const detected = detectRecurrings(byMerchant);

  for (const d of detected) {
    await db
      .insert(recurringPayments)
      .values({
        merchant: d.merchant,
        amount: d.amount.toFixed(2),
        currency: d.currency,
        cadence: d.cadence,
        cadenceDays: d.cadenceDays,
        lastDate: d.lastDate,
        nextDate: d.nextDate,
        occurrences: d.occurrences,
        categoryId: d.categoryId,
      })
      .onConflictDoUpdate({
        target: recurringPayments.merchant,
        set: {
          amount: d.amount.toFixed(2),
          currency: d.currency,
          cadence: d.cadence,
          cadenceDays: d.cadenceDays,
          lastDate: d.lastDate,
          nextDate: d.nextDate,
          occurrences: d.occurrences,
          categoryId: d.categoryId,
          updatedAt: new Date(),
        },
      });
  }

  return detected;
}
