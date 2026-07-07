import { db } from "@/db";
import { recurringPayments, transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

/**
 * Monthly bills checklist.
 *
 * PAID detection: looks for a matching DBIT within ±MATCH_WINDOW_DAYS of the
 * expected `nextDate`. This is intentionally wider than the month boundary so
 * late or early payments (like "expected 28 Jun, paid 30 Jun") are correctly
 * detected even when browsing a different month.
 *
 * States:
 *   PAID     — matching DBIT found within the detection window
 *   DUE      — nextDate is this month, not yet past the grace period
 *   OVERDUE  — past the grace period, no matching DBIT found
 *   UPCOMING — nextDate is a future month
 *   MISSED   — historical month, no matching DBIT found
 */

const OVERDUE_GRACE_DAYS = 3;
const MATCH_WINDOW_DAYS  = 7; // ± days around nextDate to count as paid

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + days * 86400_000).toISOString().slice(0, 10);
}

function isoYm(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function monthBoundsFromYm(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to   = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export type BillState = "paid" | "due" | "overdue" | "upcoming" | "missed";

export interface BillItem {
  id: number;
  merchant: string;
  notes: string | null;
  displayName: string;
  amount: number;
  cadence: string;
  cadenceDays: number | null;
  expectedOn: string | null;
  paidOnDate: string | null;     // booking_date of the matched DBIT, if found
  advancedNextDate: string | null; // what nextDate becomes after advancing
  state: BillState;
  manual: boolean;
}

export async function getBillsChecklist(
  targetYm?: string,
  now = new Date()
): Promise<{
  items: BillItem[];
  paid: number;
  total: number;
  month: string;
  isHistorical: boolean;
}> {
  const month = targetYm ?? isoYm(now);
  const isHistorical = month < isoYm(now);
  const today = now.toISOString().slice(0, 10);
  const graceCutoff = addDays(today, -OVERDUE_GRACE_DAYS);

  const recs = await db
    .select({
      id: recurringPayments.id,
      merchant: recurringPayments.merchant,
      notes: recurringPayments.notes,
      amount: sql<number>`${recurringPayments.amount}::float`,
      cadence: recurringPayments.cadence,
      cadenceDays: recurringPayments.cadenceDays,
      nextDate: recurringPayments.nextDate,
      manual: recurringPayments.manual,
    })
    .from(recurringPayments)
    .where(eq(recurringPayments.active, true))
    .orderBy(recurringPayments.merchant);

  // Pre-compute month bounds for historical checks (same for every recurring).
  const monthBounds = isHistorical ? monthBoundsFromYm(month) : null;

  // Build items with paid detection per recurring.
  const items: BillItem[] = [];

  for (const r of recs) {
    let state: BillState;
    let paidOnDate: string | null = null;

    if (isHistorical && monthBounds) {
      // ── Historical month ──────────────────────────────────────────────────
      // nextDate has already been advanced beyond this month, so window-based
      // detection would look in the wrong period. Just check whether any DBIT
      // from this merchant landed inside the target month's calendar bounds.
      const [hit] = await db
        .select({ bookingDate: transactions.bookingDate })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchant, r.merchant),
            eq(transactions.direction, "DBIT"),
            gte(transactions.bookingDate, monthBounds.from),
            lte(transactions.bookingDate, monthBounds.to)
          )
        )
        .orderBy(transactions.bookingDate)
        .limit(1);

      paidOnDate = hit?.bookingDate ?? null;
      state = paidOnDate ? "paid" : "missed";

    } else if (r.nextDate) {
      // ── Current / upcoming month ──────────────────────────────────────────
      // Check within ±MATCH_WINDOW_DAYS of the expected date so slightly
      // early or late payments (like "expected 28 Jun, paid 30 Jun") are
      // correctly detected.
      const wFrom = addDays(r.nextDate, -MATCH_WINDOW_DAYS);
      const wTo   = addDays(r.nextDate,  MATCH_WINDOW_DAYS);

      const [hit] = await db
        .select({ bookingDate: transactions.bookingDate })
        .from(transactions)
        .where(
          and(
            eq(transactions.merchant, r.merchant),
            eq(transactions.direction, "DBIT"),
            gte(transactions.bookingDate, wFrom),
            lte(transactions.bookingDate, wTo)
          )
        )
        .orderBy(transactions.bookingDate)
        .limit(1);

      if (hit?.bookingDate) {
        paidOnDate = hit.bookingDate;
        state = "paid";
      } else if (r.nextDate.slice(0, 7) > month) {
        state = "upcoming";
      } else if (r.nextDate <= graceCutoff) {
        state = "overdue";
      } else {
        state = "due";
      }

    } else {
      state = "due";
    }

    // Compute what nextDate would be if advanced by one cadence.
    let advancedNextDate: string | null = null;
    if (r.nextDate && r.cadenceDays) {
      advancedNextDate = addDays(r.nextDate, r.cadenceDays);
    } else if (r.nextDate) {
      // Fallback: advance by cadence default (monthly = 30, weekly = 7, yearly = 365)
      const fallback = r.cadence === "weekly" ? 7 : r.cadence === "yearly" ? 365 : 30;
      advancedNextDate = addDays(r.nextDate, fallback);
    }

    items.push({
      id: r.id,
      merchant: r.merchant,
      notes: r.notes,
      displayName: r.notes ?? r.merchant,
      amount: r.amount,
      cadence: r.cadence,
      cadenceDays: r.cadenceDays,
      expectedOn: r.nextDate,
      paidOnDate,
      advancedNextDate,
      state,
      manual: r.manual,
    });
  }

  const rank: Record<BillState, number> = {
    overdue: 0, missed: 0, due: 1, upcoming: 2, paid: 3,
  };
  items.sort(
    (a, b) => rank[a.state] - rank[b.state] || a.displayName.localeCompare(b.displayName)
  );

  const paid = items.filter((i) => i.state === "paid").length;
  return { items, paid, total: items.length, month, isHistorical };
}
