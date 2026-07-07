import { db } from "@/db";
import { recurringPayments, transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

/**
 * Monthly bills checklist. For every detected recurring payment, decide
 * whether this month's expected charge has been handled:
 *   PAID     — a matching DBIT booked this month
 *   DUE      — expected this month, not yet seen, still within its window
 *   OVERDUE  — expected date is in the past (+grace) and nothing booked
 *   UPCOMING — next_date falls in a later month
 *
 * Match = same merchant, DBIT, booked in the current month.
 */

const OVERDUE_GRACE_DAYS = 3;

export type BillState = "paid" | "due" | "overdue" | "upcoming";

export interface BillItem {
  id: number;
  merchant: string;
  amount: number;
  cadence: string;
  expectedOn: string | null;
  state: BillState;
}

function monthBounds(d = new Date()) {
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function getBillsChecklist(now = new Date()): Promise<{
  items: BillItem[];
  paid: number;
  total: number;
}> {
  const { from, to } = monthBounds(now);
  const today = now.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const graceCutoff = new Date(now.getTime() - OVERDUE_GRACE_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const recs = await db
    .select({
      id: recurringPayments.id,
      merchant: recurringPayments.merchant,
      amount: sql<number>`${recurringPayments.amount}::float`,
      cadence: recurringPayments.cadence,
      nextDate: recurringPayments.nextDate,
    })
    .from(recurringPayments)
    .orderBy(recurringPayments.merchant);

  // Which recurring merchants have a DBIT booked this month?
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
    if (paidSet.has(r.merchant)) {
      state = "paid";
    } else if (r.nextDate && r.nextDate.slice(0, 7) > thisMonth) {
      state = "upcoming";
    } else if (r.nextDate && r.nextDate < graceCutoff) {
      state = "overdue";
    } else {
      state = "due";
    }
    return {
      id: r.id,
      merchant: r.merchant,
      amount: r.amount,
      cadence: r.cadence,
      expectedOn: r.nextDate,
      state,
    };
  });

  // Sort: overdue → due → upcoming → paid, then by merchant.
  const rank: Record<BillState, number> = { overdue: 0, due: 1, upcoming: 2, paid: 3 };
  items.sort((a, b) => rank[a.state] - rank[b.state] || a.merchant.localeCompare(b.merchant));

  const paid = items.filter((i) => i.state === "paid").length;
  return { items, paid, total: items.length };
}
