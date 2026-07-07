import { db } from "@/db";
import { recurringPayments, transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

/**
 * Monthly bills checklist. Supports any target month (defaults to now) so
 * you can browse historical months and see what was paid / missed.
 *
 * States:
 *   PAID     — a matching DBIT booked within that month
 *   DUE      — expected this month, not yet seen, still within window
 *   OVERDUE  — expected date is past (+grace) and nothing booked
 *   UPCOMING — next_date falls in a future month
 *   MISSED   — historical month where we expected a charge but found none
 */

const OVERDUE_GRACE_DAYS = 3;

export type BillState = "paid" | "due" | "overdue" | "upcoming" | "missed";

export interface BillItem {
  id: number;
  merchant: string;
  notes: string | null;
  displayName: string; // notes ?? merchant
  amount: number;
  cadence: string;
  expectedOn: string | null;
  state: BillState;
  manual: boolean;
}

function monthBoundsFromYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function isoYm(d: Date): string {
  return d.toISOString().slice(0, 7);
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
  const { from, to } = monthBoundsFromYm(month);
  const today = now.toISOString().slice(0, 10);
  const graceCutoff = new Date(now.getTime() - OVERDUE_GRACE_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const recs = await db
    .select({
      id: recurringPayments.id,
      merchant: recurringPayments.merchant,
      notes: recurringPayments.notes,
      amount: sql<number>`${recurringPayments.amount}::float`,
      cadence: recurringPayments.cadence,
      nextDate: recurringPayments.nextDate,
      manual: recurringPayments.manual,
    })
    .from(recurringPayments)
    .where(eq(recurringPayments.active, true))
    .orderBy(recurringPayments.merchant);

  // Which recurring merchants have a DBIT booked in the target month?
  const paidRows = await db
    .select({ merchant: transactions.merchant })
    .from(transactions)
    .where(
      and(
        eq(transactions.direction, "DBIT"),
        gte(transactions.bookingDate, from),
        lte(transactions.bookingDate, to)
      )
    )
    .groupBy(transactions.merchant);
  const paidSet = new Set(paidRows.map((r) => r.merchant).filter(Boolean) as string[]);

  const items: BillItem[] = recs.map((r) => {
    let state: BillState;
    const paid = paidSet.has(r.merchant);
    if (paid) {
      state = "paid";
    } else if (isHistorical) {
      // For past months, unpaid = missed
      state = "missed";
    } else if (r.nextDate && r.nextDate.slice(0, 7) > month) {
      state = "upcoming";
    } else if (r.nextDate && r.nextDate <= graceCutoff) {
      state = "overdue";
    } else {
      state = "due";
    }
    return {
      id: r.id,
      merchant: r.merchant,
      notes: r.notes,
      displayName: r.notes ?? r.merchant,
      amount: r.amount,
      cadence: r.cadence,
      expectedOn: r.nextDate,
      state,
      manual: r.manual,
    };
  });

  const rank: Record<BillState, number> = {
    overdue: 0, missed: 0, due: 1, upcoming: 2, paid: 3,
  };
  items.sort((a, b) => rank[a.state] - rank[b.state] || a.displayName.localeCompare(b.displayName));

  const paid = items.filter((i) => i.state === "paid").length;
  return { items, paid, total: items.length, month, isHistorical };
}
