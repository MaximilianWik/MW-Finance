import { env } from "@/lib/env";

// ─── Live quote (Finnhub) ───────────────────────────────────────────────────
// Finnhub's free /quote endpoint returns the live price + day stats.
//   c = current, d = change, dp = change %, h = high, l = low, o = open,
//   pc = previous close, t = unix seconds

export interface Quote {
  symbol: string;
  current: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number; // vs previous close (today's move), from Finnhub `dp`
  ts: number;        // unix seconds
}

interface FinnhubQuote {
  c: number;
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

/** Fetch a live quote from Finnhub. Throws on network / bad-symbol failure. */
export async function fetchQuote(symbol: string): Promise<Quote> {
  const sym = symbol.trim().toUpperCase();
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${env.finnhubApiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${await res.text()}`);
  const q = (await res.json()) as FinnhubQuote;
  // Finnhub returns c=0 for unknown symbols rather than an error status.
  if (!q || !q.c) throw new Error(`No quote for "${sym}"`);
  return {
    symbol: sym,
    current: q.c,
    prevClose: q.pc,
    open: q.o,
    high: q.h,
    low: q.l,
    changePct: q.dp ?? 0,
    ts: q.t,
  };
}

// ─── Intraday candles (Yahoo Finance) ───────────────────────────────────────
// Finnhub's free tier dropped intraday candles (paid since 2024), so the graph
// pulls the intraday line from Yahoo's public chart endpoint. Unofficial but
// free and keyless. Needs a browser-ish User-Agent to avoid 429s.

export interface CandlePoint {
  t: number;     // unix seconds
  price: number; // close for the interval
}

export interface Candles {
  symbol: string;
  prevClose: number | null;
  points: CandlePoint[];
}

interface YahooChart {
  chart: {
    result?: Array<{
      meta: { previousClose?: number; chartPreviousClose?: number };
      timestamp?: number[];
      indicators: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

/**
 * Fetch intraday candles from Yahoo. `range` follows Yahoo's syntax
 * (1d, 5d, 1mo…); interval is chosen to keep the series compact.
 */
export async function fetchCandles(symbol: string, range = "1d"): Promise<Candles> {
  const sym = symbol.trim().toUpperCase();
  const interval = range === "1d" ? "2m" : range === "5d" ? "15m" : "1d";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MWFinance/1.0)" },
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as YahooChart;
  const r = data.chart.result?.[0];
  if (!r) throw new Error(`No candles for "${sym}"`);

  const ts = r.timestamp ?? [];
  const closes = r.indicators.quote?.[0]?.close ?? [];
  const points: CandlePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const price = closes[i];
    if (price != null && Number.isFinite(price)) points.push({ t: ts[i], price });
  }

  return {
    symbol: sym,
    prevClose: r.meta.previousClose ?? r.meta.chartPreviousClose ?? null,
    points,
  };
}
