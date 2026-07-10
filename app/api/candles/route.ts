import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, type Candles } from "@/lib/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Intraday history changes slowly relative to the live price; cache longer than
// /api/quote. The client stitches its own live tail onto this base series.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; candles: Candles }>();

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const range = req.nextUrl.searchParams.get("range")?.trim() || "1d";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const key = `${symbol}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ candles: hit.candles, cached: true });
  }

  try {
    const candles = await fetchCandles(symbol, range);
    cache.set(key, { at: Date.now(), candles });
    return NextResponse.json({ candles, cached: false });
  } catch (e) {
    if (hit) return NextResponse.json({ candles: hit.candles, cached: true, stale: true });
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
