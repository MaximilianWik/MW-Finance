import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, sql, and, isNotNull, inArray, notInArray } from "drizzle-orm";
import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";
import type { NewTransaction } from "@/db/schema";

/**
 * Flags newly-inserted DBIT rows that look off. Rules (any one trips it):
 *   (a) Merchant never seen before AND amount > NEW_MERCHANT_FACTOR × your
 *       overall median transaction size.
 *   (b) Merchant seen before AND this amount > MERCHANT_SPIKE_FACTOR × the
 *       merchant's own median.
 *
 * Fires a priority-5 ntfy per flagged transaction and stamps
 * `flagged_reason` on the row.
 */

const NEW_MERCHANT_FACTOR = 2;
const MERCHANT_SPIKE_FACTOR = 3;
const GLOBAL_LOOKBACK_DAYS = 180;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export interface Flagged {
  id: number;
  merchant: string;
  amount: number;
  reason: string;
}

export async function flagSuspicious(rows: NewTransaction[]): Promise<Flagged[]> {
  const dbits = rows
    .filter((r) => r.direction === "DBIT" && r.id != null && r.merchant)
    .map((r) => ({
      id: r.id as number,
      merchant: r.merchant as string,
      amount: Number(r.amount),
    }));
  if (dbits.length === 0) return [];

  // Global median across recent history.
  const from = isoDaysAgo(GLOBAL_LOOKBACK_DAYS);
  const [globalRow] = await db
    .select({
      median: sql<number | null>`percentile_cont(0.5) within group (order by ${transactions.amount}::float)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.direction, "DBIT"),
        sql`${transactions.bookingDate} >= ${from}`
      )
    );
  const globalMedian = globalRow?.median ?? 0;

  // Per-merchant median (only for merchants we've seen before this insert).
  const merchants = Array.from(new Set(dbits.map((r) => r.merchant)));
  const newIds = new Set(dbits.map((r) => r.id));
  const perMerchant = new Map<string, { median: number; count: number }>();

  if (merchants.length > 0) {
    // Exclude the just-inserted rows so a first-ever occurrence isn't compared
    // against itself.
    const newIdArr = Array.from(newIds);
    const rows = await db
      .select({
        merchant: transactions.merchant,
        median: sql<number>`percentile_cont(0.5) within group (order by ${transactions.amount}::float)`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.direction, "DBIT"),
          inArray(transactions.merchant, merchants),
          isNotNull(transactions.merchant),
          newIdArr.length > 0
            ? notInArray(transactions.id, newIdArr)
            : sql`true`
        )
      )
      .groupBy(transactions.merchant);
    for (const row of rows) {
      if (row.merchant) perMerchant.set(row.merchant, { median: row.median, count: row.count });
    }
  }

  const flagged: Flagged[] = [];

  for (const r of dbits) {
    const prior = perMerchant.get(r.merchant);
    let reason: string | null = null;

    if (!prior || prior.count === 0) {
      if (globalMedian > 0 && r.amount > NEW_MERCHANT_FACTOR * globalMedian) {
        reason = `New merchant · ${Math.round(r.amount)} kr (>${NEW_MERCHANT_FACTOR}× your typical spend)`;
      }
    } else if (prior.median > 0 && r.amount > MERCHANT_SPIKE_FACTOR * prior.median) {
      reason = `${r.merchant} spike · ${Math.round(r.amount)} kr (>${MERCHANT_SPIKE_FACTOR}× the usual ${Math.round(prior.median)} kr)`;
    }

    if (!reason) continue;

    await db
      .update(transactions)
      .set({ flaggedReason: reason })
      .where(eq(transactions.id, r.id));

    await sendNtfy(reason, {
      title: "Unusual charge",
      tags: ["rotating_light"],
      priority: 5,
      click: env.appUrl + "/transactions",
    });

    flagged.push({ id: r.id, merchant: r.merchant, amount: r.amount, reason });
  }

  return flagged;
}
