import { db } from "@/db";
import { investmentAccounts, transactions } from "@/db/schema";
import { and, asc, ilike, sql } from "drizzle-orm";

/**
 * Investment accounts are the single source of truth for "invested capital".
 * An account's current balance is its seed plus the net of transactions matching
 * its merchant since the seed date. The all-time invested figure the reactor
 * fuels on is exactly the total shown in the Investments box (sum of seed+delta),
 * NOT the category-outflow tally — so the box value and the reactor agree.
 */

/** Compute balance delta for one account from its linked transactions. */
export async function computeDelta(merchant: string, seedDate: string | null) {
  const merchantMatch = ilike(transactions.merchant, `%${merchant}%`);
  const where = seedDate
    ? and(merchantMatch, sql`${transactions.bookingDate} > ${seedDate}`)
    : merchantMatch;

  const [row] = await db
    .select({
      deposits:    sql<number>`coalesce(sum(case when ${transactions.direction}='DBIT' then ${transactions.amount}::float else 0 end),0)::float`,
      withdrawals: sql<number>`coalesce(sum(case when ${transactions.direction}='CRDT' then ${transactions.amount}::float else 0 end),0)::float`,
      txCount:     sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(where);

  const deposits    = row?.deposits    ?? 0;
  const withdrawals = row?.withdrawals ?? 0;
  return { delta: deposits - withdrawals, deposits, withdrawals, txCount: row?.txCount ?? 0 };
}

/**
 * All accounts with their computed current balances plus the server-side total.
 * The total is sum(seed + delta) across accounts — the same figure the
 * Investments box renders before applying live-price pegs client-side.
 */
export async function getInvestmentAccounts() {
  const accs = await db
    .select()
    .from(investmentAccounts)
    .orderBy(asc(investmentAccounts.sort), asc(investmentAccounts.id));

  const enriched = await Promise.all(
    accs.map(async (acc) => {
      const seed = Number(acc.seedBalance);
      const priceMeta = {
        ticker:    acc.ticker,
        basePrice: acc.basePrice != null ? Number(acc.basePrice) : null,
        shares:    acc.shares != null ? Number(acc.shares) : null,
      };
      if (!acc.merchant) {
        return { ...acc, ...priceMeta, seedBalance: seed, currentBalance: seed, delta: 0, deposits: 0, withdrawals: 0, txCount: 0 };
      }
      const { delta, deposits, withdrawals, txCount } = await computeDelta(acc.merchant, acc.seedDate);
      return { ...acc, ...priceMeta, seedBalance: seed, currentBalance: Math.round((seed + delta) * 100) / 100, delta: Math.round(delta * 100) / 100, deposits: Math.round(deposits * 100) / 100, withdrawals: Math.round(withdrawals * 100) / 100, txCount };
    })
  );

  const total = Math.round(enriched.reduce((s, a) => s + a.currentBalance, 0) * 100) / 100;
  return { accounts: enriched, total };
}

/** All-time invested total = the Investments box value (sum of seed + delta). */
export async function getInvestmentAccountsTotal(): Promise<number> {
  const { total } = await getInvestmentAccounts();
  return total;
}
