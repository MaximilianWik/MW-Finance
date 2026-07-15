import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { investmentAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchQuote } from "@/lib/quote";
import { getInvestmentAccounts } from "@/lib/investments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all accounts with their computed current balances. */
export async function GET() {
  try {
    const { accounts, total } = await getInvestmentAccounts();
    return NextResponse.json({ accounts, total });
  } catch (e) {
    console.error("[GET /api/investments]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

/** Create a new investment account. */
export async function POST(req: NextRequest) {
  try {
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

    // Try to peg base_price at creation. If the Finnhub key is missing or the
    // fetch fails, create the account without a peg — the user can re-peg later
    // via "set balance". Never let a quote failure block account creation.
    const ticker = body.ticker?.trim().toUpperCase() || null;
    let basePrice: string | null = null;
    let pegWarning: string | null = null;
    if (ticker) {
      try {
        basePrice = String((await fetchQuote(ticker)).current);
      } catch (e) {
        pegWarning = `Live peg skipped: ${e instanceof Error ? e.message : e}`;
        console.warn("[POST /api/investments] peg skipped:", pegWarning);
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

    return NextResponse.json({ account: created, pegWarning }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/investments]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

/**
 * Update an account.
 * - Pass `balance` to reset the seed to that absolute value (seed_date = today).
 * - Pass `name`, `color`, `merchant`, `sort` to update metadata.
 * - Pass `ticker` + `shares` to link to a stock; clears peg on ticker=null.
 */
export async function PATCH(req: NextRequest) {
  try {
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

    const newTicker = "ticker" in body ? (body.ticker?.trim().toUpperCase() || null) : undefined;
    if (newTicker !== undefined) {
      set.ticker = newTicker;
      if (newTicker === null) { set.basePrice = null; set.shares = null; }
    }
    const effectiveTicker = newTicker !== undefined ? newTicker : existing.ticker;
    const tickerChanged   = newTicker !== undefined && newTicker !== existing.ticker;
    const shouldPeg = !!effectiveTicker && (tickerChanged || body.balance !== undefined);

    let pegWarning: string | null = null;
    if (shouldPeg) {
      try {
        set.basePrice = String((await fetchQuote(effectiveTicker!)).current);
      } catch (e) {
        pegWarning = `Live peg skipped: ${e instanceof Error ? e.message : e}`;
        console.warn("[PATCH /api/investments] peg skipped:", pegWarning);
        // Don't fail the update — balance/ticker are still saved correctly.
      }
    }

    const [updated] = await db
      .update(investmentAccounts)
      .set(set)
      .where(eq(investmentAccounts.id, body.id))
      .returning();

    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ account: updated, pegWarning });
  } catch (e) {
    console.error("[PATCH /api/investments]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.delete(investmentAccounts).where(eq(investmentAccounts.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/investments]", e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
