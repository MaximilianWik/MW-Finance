import { db } from "@/db";
import { transactions, recurringPayments } from "@/db/schema";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";

/**
 * Missing-payment detector. For each recurring payment whose next_date is
 * more than GRACE_DAYS in the past, check whether the transaction actually
 * booked within a small window around next_date. If not, fire an ntfy alert
 * (once per detection — we stamp last_alerted_at to suppress duplicates).
 */

const GRACE_DAYS = 3;
const MATCH_WINDOW_DAYS = 5; // ± around next_date when hunting for the tx
const REALERT_DAYS = 14; // don't re-alert for the same recurring more often

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysFrom(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return new Date(d.getTime() + days * 86400_000).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((tb - ta) / 86400_000);
}

export interface MissedRecurring {
  id: number;
  merchant: string;
  amount: number;
  expectedOn: string;
  daysLate: number;
}

export async function checkMissingRecurrings(): Promise<MissedRecurring[]> {
  const today = isoToday();
  const cutoff = isoDaysFrom(today, -GRACE_DAYS);

  const rows = await db
    .select({
      id: recurringPayments.id,
      merchant: recurringPayments.merchant,
      amount: sql<number>`${recurringPayments.amount}::float`,
      nextDate: recurringPayments.nextDate,
      cadenceDays: recurringPayments.cadenceDays,
      lastAlertedAt: recurringPayments.lastAlertedAt,
    })
    .from(recurringPayments)
    .where(
      and(
        eq(recurringPayments.active, true),
        isNotNull(recurringPayments.nextDate),
        lte(recurringPayments.nextDate, cutoff)
      )
    );

  const missed: MissedRecurring[] = [];

  for (const r of rows) {
    if (!r.nextDate) continue;

    // Suppress re-alerts within REALERT_DAYS.
    if (r.lastAlertedAt) {
      const lastIso = r.lastAlertedAt.toISOString().slice(0, 10);
      if (daysBetween(lastIso, today) < REALERT_DAYS) continue;
    }

    const from = isoDaysFrom(r.nextDate, -MATCH_WINDOW_DAYS);
    const to = isoDaysFrom(r.nextDate, MATCH_WINDOW_DAYS);

    const [{ hit }] = await db
      .select({
        hit: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.merchant, r.merchant),
          eq(transactions.direction, "DBIT"),
          gte(transactions.bookingDate, from),
          lte(transactions.bookingDate, to)
        )
      );

    if (hit > 0) {
      // Payment did arrive — advance next_date based on cadence.
      if (r.cadenceDays) {
        const nn = isoDaysFrom(r.nextDate, r.cadenceDays);
        await db
          .update(recurringPayments)
          .set({ nextDate: nn, lastDate: r.nextDate, updatedAt: new Date() })
          .where(eq(recurringPayments.id, r.id));
      }
      continue;
    }

    const daysLate = daysBetween(r.nextDate, today);
    missed.push({
      id: r.id,
      merchant: r.merchant,
      amount: r.amount,
      expectedOn: r.nextDate,
      daysLate,
    });

    await sendNtfy(
      `${r.merchant} hasn't charged — expected ${new Date(
        r.nextDate + "T00:00:00Z"
      ).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} (${daysLate}d late)`,
      {
        title: "Missing payment",
        tags: ["warning"],
        priority: 4,
        click: env.appUrl + "/insights",
      }
    );

    await db
      .update(recurringPayments)
      .set({ lastAlertedAt: new Date() })
      .where(eq(recurringPayments.id, r.id));
  }

  return missed;
}
