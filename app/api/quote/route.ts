import { NextRequest, NextResponse } from "next/server";
import { fetchQuote, type Quote } from "@/lib/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small in-memory cache so rapid polls (multiple accounts, page focus) don't
// burn the Finnhub free-tier rate limit. 15s TTL matches the client poll.
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; quote: Quote }>();

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ quote: hit.quote, cached: true });
  }

  try {
    const quote = await fetchQuote(symbol);
    cache.set(symbol, { at: Date.now(), quote });
    return NextResponse.json({ quote, cached: false });
  } catch (e) {
    // Serve a stale value if we have one rather than breaking the panel.
    if (hit) return NextResponse.json({ quote: hit.quote, cached: true, stale: true });
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
