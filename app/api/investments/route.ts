import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { investmentAccounts, transactions } from "@/db/schema";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { fetchQuote } from "@/lib/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compute balance delta for one account from its linked transactions. */
async function computeDelta(merchant: string, seedDate: string | null) {
  // ILIKE so "LYSA" matches "LYSA AB", "LYSA FONDER", etc.
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

/** List all accounts with their computed current balances. */
export async function GET() {
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

  const total = enriched.reduce((s, a) => s + a.currentBalance, 0);
  return NextResponse.json({ accounts: enriched, total: Math.round(total * 100) / 100 });
}

/** Create a new investment account. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    color?: string;
    merchant?: string;
    balance?: number;
    sort?: number;
    ticker?: string | null;
    shares?: number | null;
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  // If linked to a ticker, peg base_price to the live quote at creation.
  const ticker = body.ticker?.trim().toUpperCase() || null;
  let basePrice: string | null = null;
  if (ticker) {
    try {
      basePrice = String((await fetchQuote(ticker)).current);
    } catch (e) {
      return NextResponse.json({ error: `quote failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  }

  const [created] = await db
    .insert(investmentAccounts)
    .values({
      name:        body.name.trim().toUpperCase(),
      color:       body.color ?? "#3ea0c8",
      merchant:    body.merchant?.trim().toUpperCase() || body.name.trim().toUpperCase(),
      seedBalance: String(body.balance ?? 0),
      seedDate:    body.balance != null ? today : null,
      sort:        body.sort ?? 100,
      ticker,
      basePrice,
      shares:      body.shares != null ? String(body.shares) : null,
    })
    .returning();

  return NextResponse.json({ account: created }, { status: 201 });
}

/**
 * Update an account.
 * - Pass `balance` to reset the seed to that absolute value (seed_date = today).
 * - Pass `name`, `color`, `merchant`, `sort` to update metadata.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: number;
    name?: string;
    color?: string;
    merchant?: string | null;
    balance?: number | null;
    sort?: number;
    ticker?: string | null;
    shares?: number | null;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(investmentAccounts)
    .where(eq(investmentAccounts.id, body.id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name     !== undefined) set.name     = body.name.trim().toUpperCase();
  if (body.color    !== undefined) set.color    = body.color;
  if ("merchant" in body)          set.merchant = body.merchant?.trim().toUpperCase() || null;
  if (body.sort     !== undefined) set.sort     = body.sort;
  if (body.balance  !== undefined) {
    set.seedBalance = String(body.balance ?? 0);
    set.seedDate    = today;
  }
  if ("shares" in body) set.shares = body.shares != null ? String(body.shares) : null;

  // Ticker peg. base_price is (re)captured to the live quote when the ticker is
  // set/changed, or when the balance is re-set on an already-linked account
  // ("set balance" = re-peg from now). Clearing the ticker clears the peg.
  const newTicker = "ticker" in body ? (body.ticker?.trim().toUpperCase() || null) : undefined;
  if (newTicker !== undefined) {
    set.ticker = newTicker;
    if (newTicker === null) { set.basePrice = null; set.shares = null; }
  }
  const effectiveTicker = newTicker !== undefined ? newTicker : existing.ticker;
  const tickerChanged   = newTicker !== undefined && newTicker !== existing.ticker;
  const shouldPeg =
    !!effectiveTicker && (tickerChanged || body.balance !== undefined);
  if (shouldPeg) {
    try {
      set.basePrice = String((await fetchQuote(effectiveTicker!)).current);
    } catch (e) {
      return NextResponse.json({ error: `quote failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  }

  const [updated] = await db
    .update(investmentAccounts)
    .set(set)
    .where(eq(investmentAccounts.id, body.id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(investmentAccounts).where(eq(investmentAccounts.id, id));
  return NextResponse.json({ ok: true });
}
