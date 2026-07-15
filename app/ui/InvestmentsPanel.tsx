"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { kr } from "@/lib/format";
import { XP_PER_100_KR_INVEST } from "@/lib/game/level";

interface AccountRow {
  id: number;
  name: string;
  color: string;
  merchant: string | null;
  seedBalance: number;
  seedDate: string | null;
  currency: string;
  sort: number;
  currentBalance: number;
  delta: number;
  deposits: number;
  withdrawals: number;
  txCount: number;
  ticker: string | null;
  basePrice: number | null;
  shares: number | null;
}

interface ApiResponse {
  accounts: AccountRow[];
  total: number;
}

interface Quote {
  symbol: string;
  current: number;
  prevClose: number;
  changePct: number;
  ts: number;
}

interface SeriesEntry {
  points: number[];   // close prices
  prevClose: number | null;
}

/**
 * Per-account investment balance tracker.
 *
 * Accounts are either transaction-tracked (seed + txn delta) or price-pegged
 * (seed × live_price / base_price). Pegged accounts render a live quote badge
 * and an intraday chart seeded from Yahoo Finance.
 */
export function InvestmentsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editTicker, setEditTicker] = useState("");
  const [editShares, setEditShares] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newColor, setNewColor] = useState("#3ea0c8");
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [series, setSeries] = useState<Record<string, SeriesEntry>>({});

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/investments");
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Poll live quotes + intraday candles ─────────────────────────────────
  const accounts = data?.accounts ?? [];
  const tickers = Array.from(
    new Set(accounts.map((a) => a.ticker).filter((t): t is string => !!t))
  );
  const tickerKey = tickers.join(",");

  useEffect(() => {
    if (!tickerKey) return;
    const syms = tickerKey.split(",");
    let alive = true;

    async function pullQuotes() {
      const results = await Promise.all(
        syms.map(async (s) => {
          try {
            const r = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}`);
            if (!r.ok) return null;
            const { quote } = (await r.json()) as { quote: Quote };
            return quote;
          } catch { return null; }
        })
      );
      if (!alive) return;
      setQuotes((prev) => {
        const next = { ...prev };
        for (const q of results) if (q) next[q.symbol] = q;
        return next;
      });
      setSeries((prev) => {
        const next = { ...prev };
        for (const q of results) {
          if (!q) continue;
          const cur = next[q.symbol] ?? { points: [], prevClose: null };
          next[q.symbol] = { ...cur, points: [...cur.points, q.current].slice(-300) };
        }
        return next;
      });
    }

    async function pullCandles() {
      await Promise.all(
        syms.map(async (s) => {
          try {
            const r = await fetch(`/api/candles?symbol=${encodeURIComponent(s)}&range=1d`);
            if (!r.ok) return;
            const { candles } = (await r.json()) as {
              candles: { prevClose: number | null; points: { price: number }[] };
            };
            const base = candles.points.map((p) => p.price);
            if (!alive || base.length === 0) return;
            setSeries((prev) => {
              const existing = prev[s];
              const merged = existing && existing.points.length > base.length
                ? existing.points
                : base;
              return { ...prev, [s]: { points: merged, prevClose: candles.prevClose } };
            });
          } catch { /* silent */ }
        })
      );
    }

    pullCandles();
    pullQuotes();
    const qi = setInterval(pullQuotes, 15_000);
    const ci = setInterval(pullCandles, 60_000);
    return () => { alive = false; clearInterval(qi); clearInterval(ci); };
  }, [tickerKey]);

  // ─── Mutations ───────────────────────────────────────────────────────────

  async function setBalance(id: number, currentTicker: string | null) {
    const val = Number(editVal);
    if (isNaN(val)) return;
    setBusy(true);
    setNotice(null);
    try {
      const t = editTicker.trim().toUpperCase() || null;
      const body: Record<string, unknown> = { id, balance: val };
      // Only send ticker if it changed — re-peg on balance-set happens server-side
      // via the existing ticker even if we don't send it here.
      if (t !== currentTicker) body.ticker = t;
      if (editShares.trim() !== "") body.shares = Number(editShares);
      const res = await fetch("/api/investments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setNotice(`Error: ${json.error ?? res.status}`); return; }
      if (json.pegWarning) setNotice(json.pegWarning);
      setEditId(null);
      await fetchAll();
    } catch (e) {
      setNotice(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/investments?id=${id}`, { method: "DELETE" });
      await fetchAll();
    } finally {
      setBusy(false);
    }
  }

  async function addAccount() {
    if (!newName.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:    newName.trim(),
          color:   newColor,
          balance: newBalance ? Number(newBalance) : 0,
          ticker:  newTicker.trim().toUpperCase() || null,
          shares:  newShares.trim() !== "" ? Number(newShares) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setNotice(`Error: ${json.error ?? res.status}`); return; }
      if (json.pegWarning) setNotice(json.pegWarning);
      setNewName(""); setNewBalance(""); setNewColor("#3ea0c8"); setNewTicker(""); setNewShares("");
      setAddOpen(false);
      await fetchAll();
    } catch (e) {
      setNotice(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <span className="panel-title">[ INVESTMENTS ]</span>
        <p className="py-4 text-center text-sm text-muted">loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <span className="panel-title">[ INVESTMENTS ]</span>
        <p className="py-3 text-[0.7rem] text-danger">{error}</p>
      </div>
    );
  }

  const total = accounts.reduce((s, a) => s + liveValue(a, quotes[a.ticker ?? ""]), 0);

  // Unique tickers that have quote data — used for the chart section.
  const charted = tickers.filter((t) => (series[t]?.points.length ?? 0) > 1);

  return (
    <div className="panel">
      <span className="panel-title">[ INVESTMENTS ]</span>
      <span className="absolute -top-[0.62rem] right-3 bg-ink px-2 text-[0.7rem] uppercase tracking-term text-ink2">
        {kr(total)}
      </span>

      <div className="flex flex-col">
        {/* ─── Notice banner ─────────────────────────── */}
        {notice && (
          <p className="mb-2 text-[0.68rem] text-amber">
            {notice}
            <button onClick={() => setNotice(null)} className="ml-2 text-faint hover:text-ink2">×</button>
          </p>
        )}

        {accounts.length === 0 ? (
          <p className="py-3 text-sm text-muted">No accounts yet. Add one below.</p>
        ) : (
          accounts.map((acc) => {
            const quote = acc.ticker ? quotes[acc.ticker] : undefined;
            const value = liveValue(acc, quote);
            const pegged = !!(acc.ticker && acc.basePrice && quote);
            const pegPct = pegged ? (quote!.current / acc.basePrice! - 1) * 100 : 0;
            const pegDelta = value - acc.currentBalance;
            const up = pegPct >= 0;

            return (
              <div key={acc.id} className="border-b border-grid py-2 last:border-0">
                {editId === acc.id ? (
                  /* ─── Edit row ─────────────────────── */
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-[0.75rem]" style={{ color: acc.color }}>■</span>
                    <span className="text-[0.75rem] uppercase tracking-term text-ink2">{acc.name}</span>
                    <label className="prompt min-w-[7rem] flex-1">
                      <span className="sigil text-faint">kr</span>
                      <input
                        autoFocus
                        type="number"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setBalance(acc.id, acc.ticker);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="!w-full tabular-nums text-xs"
                        placeholder="amount"
                      />
                    </label>
                    <input
                      value={editTicker}
                      onChange={(e) => setEditTicker(e.target.value.toUpperCase())}
                      placeholder="TICKER"
                      className="input w-20 uppercase tracking-term text-xs"
                    />
                    <input
                      type="number"
                      value={editShares}
                      onChange={(e) => setEditShares(e.target.value)}
                      placeholder="shares"
                      className="input w-20 tabular-nums text-xs"
                    />
                    <button onClick={() => setBalance(acc.id, acc.ticker)} disabled={busy}
                      className="btn btn-accent !py-0.5 !px-2 text-xs">$ set</button>
                    <button onClick={() => setEditId(null)} className="btn !py-0.5 !px-2 text-xs">cancel</button>
                  </div>
                ) : (
                  /* ─── Display row ──────────────────── */
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="flex items-center gap-2 text-[0.75rem] uppercase tracking-term text-ink2">
                        <span style={{ color: acc.color }}>■</span>
                        {acc.name}
                        {acc.ticker && (
                          <span className="text-faint">{acc.ticker}{acc.shares != null ? ` · ${acc.shares} sh` : ""}</span>
                        )}
                      </span>
                      <div className="flex items-baseline gap-3">
                        <span className="tabular-nums text-sm font-medium text-ink2">{kr(value)}</span>
                        {pegged && (
                          <span className="tabular-nums text-[0.7rem] font-medium"
                                style={{ color: up ? "#4ec96a" : "#e85252" }}>
                            {up ? "▲" : "▼"} {up ? "+" : ""}{pegPct.toFixed(2)}%
                          </span>
                        )}
                        <button
                          onClick={() => { setEditId(acc.id); setEditVal(String(acc.currentBalance)); setEditTicker(acc.ticker ?? ""); setEditShares(acc.shares != null ? String(acc.shares) : ""); }}
                          className="btn !py-0 !px-1.5 text-[0.65rem] opacity-50 hover:opacity-100"
                        >edit</button>
                        <button onClick={() => deleteAccount(acc.id, acc.name)} disabled={busy}
                          className="btn btn-danger !py-0 !px-1.5 text-[0.65rem]">del</button>
                      </div>
                    </div>

                    {/* Peg stats line */}
                    {pegged && (
                      <p className="mt-0.5 text-[0.65rem] tabular-nums text-faint">
                        <span style={{ color: up ? "#4ec96a" : "#e85252" }}>
                          {pegDelta >= 0 ? "+" : ""}{kr(pegDelta)}
                        </span>
                        {" · "}${quote!.current.toFixed(2)}
                        {quote!.changePct != null && (
                          <span className="ml-1">({quote!.changePct >= 0 ? "+" : ""}{quote!.changePct.toFixed(2)}% today)</span>
                        )}
                        {!acc.basePrice && <span className="ml-1 text-amber"> · no base — edit to peg</span>}
                      </p>
                    )}
                    {acc.ticker && !pegged && !quote && (
                      <p className="mt-0.5 text-[0.65rem] text-faint">
                        {acc.basePrice ? "fetching live price…" : "no base price — edit → set balance to peg"}
                      </p>
                    )}

                    {/* Transaction delta (non-pegged) */}
                    {!acc.ticker && acc.txCount > 0 && (
                      <p className="mt-0.5 text-[0.65rem] tabular-nums text-faint">
                        {acc.delta >= 0 ? "+" : ""}{kr(acc.delta)} · {acc.txCount} tx since base
                        {acc.seedDate && <span className="ml-1 text-faint/60">({acc.seedDate})</span>}
                      </p>
                    )}
                    {!acc.ticker && acc.txCount === 0 && acc.merchant && (
                      <p className="mt-0.5 text-[0.65rem] text-faint">no new transactions since base</p>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        {/* ─── Intraday chart(s) ───────────────────────── */}
        {charted.map((sym) => {
          const s = series[sym]!;
          const q = quotes[sym];
          const up = q ? q.current >= (s.prevClose ?? q.current) : true;
          return (
            <TickerChart
              key={sym}
              symbol={sym}
              points={s.points}
              prevClose={s.prevClose}
              current={q?.current ?? null}
              changePct={q?.changePct ?? null}
              up={up}
            />
          );
        })}
        {/* Placeholder while chart loads */}
        {tickers.length > 0 && charted.length === 0 && (
          tickers.map((sym) => (
            <div key={sym} className="mt-3 border-t border-grid pt-3">
              <p className="text-[0.65rem] uppercase tracking-term text-faint">[ {sym} · loading chart… ]</p>
              <div className="mt-1 h-16 w-full rounded bg-panel2 opacity-40" />
            </div>
          ))
        )}

        {/* ─── Total row ───────────────────────────────── */}
        {accounts.length > 1 && (
          <div className="mt-2 flex justify-between border-t border-edge pt-2 text-xs uppercase tracking-term">
            <span className="text-muted">total</span>
            <span className="tabular-nums font-medium text-ink2">{kr(total)}</span>
          </div>
        )}

        {/* ─── Add account ─────────────────────────────── */}
        {addOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
            <span className="text-xs uppercase tracking-term text-accent">$ new</span>
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="NAME" className="input w-28 uppercase tracking-term" />
            <label className="prompt w-24">
              <span className="sigil text-faint">kr</span>
              <input type="number" value={newBalance} onChange={(e) => setNewBalance(e.target.value)}
                placeholder="0" className="!w-full tabular-nums text-xs" />
            </label>
            <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder="TICKER" className="input w-20 uppercase tracking-term text-xs" />
            <input type="number" value={newShares} onChange={(e) => setNewShares(e.target.value)}
              placeholder="shares" className="input w-20 tabular-nums text-xs" />
            <button onClick={addAccount} disabled={busy || !newName.trim()} className="btn btn-accent">add</button>
            <button onClick={() => setAddOpen(false)} className="btn">cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)} className="mt-3 btn self-start text-xs">+ account</button>
        )}

        {/* ─── Reactor feed line ───────────────────────── */}
        {accounts.length > 0 && (
          <Link
            href="/rank"
            className="mt-3 flex items-center justify-center gap-1 border-t border-edge pt-2 text-[0.65rem] uppercase tracking-term text-faint hover:text-accent2"
          >
            <span className="text-accent2">⚡</span>
            feeds {(Math.floor((data?.total ?? 0) / 100) * XP_PER_100_KR_INVEST).toLocaleString("sv-SE")} XP into the reactor core →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function liveValue(acc: AccountRow, quote: Quote | undefined): number {
  if (acc.ticker && acc.basePrice && quote && quote.current > 0) {
    return Math.round(acc.currentBalance * (quote.current / acc.basePrice) * 100) / 100;
  }
  return acc.currentBalance;
}

// ─── TickerChart ─────────────────────────────────────────────────────────────

interface TickerChartProps {
  symbol: string;
  points: number[];
  prevClose: number | null;
  current: number | null;
  changePct: number | null;
  up: boolean;
}

function TickerChart({ symbol, points, prevClose, current, changePct, up }: TickerChartProps) {
  const W = 400, H = 64, PX = 2, PY = 6;
  const color = up ? "#4ec96a" : "#e85252";
  const colorFaint = up ? "#1f5430" : "#5a1f1f";

  // Extend series with current live price as the final point.
  const pts = current != null && points.length > 0
    ? [...points, current]
    : points;

  const min = Math.min(...pts, ...(prevClose != null ? [prevClose] : []));
  const max = Math.max(...pts, ...(prevClose != null ? [prevClose] : []));
  const span = max - min || 1;

  const cx = (i: number) => PX + (i / (pts.length - 1)) * (W - PX * 2);
  const cy = (v: number) => H - PY - ((v - min) / span) * (H - PY * 2);

  const linePath = pts.map((v, i) =>
    `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`
  ).join(" ");

  // Fill under the line back to prevClose level (or bottom).
  const baseline = prevClose != null ? cy(prevClose) : H - PY;
  const fillPath = pts.length > 1
    ? `${linePath} L${cx(pts.length - 1).toFixed(1)},${baseline.toFixed(1)} L${cx(0).toFixed(1)},${baseline.toFixed(1)} Z`
    : "";

  // Prev-close dashed horizontal.
  const pcY = prevClose != null ? cy(prevClose) : null;

  // Live dot at the last point.
  const dotX = pts.length > 1 ? cx(pts.length - 1) : null;
  const dotY = pts.length > 0 ? cy(pts[pts.length - 1]) : null;

  // Label values.
  const displayCurrent = current ?? pts[pts.length - 1];
  const displayPc = prevClose;

  return (
    <div className="mt-3 border-t border-grid pt-3">
      {/* Header */}
      <div className="mb-1 flex items-baseline justify-between text-[0.65rem] uppercase tracking-term">
        <span className="text-faint">[ {symbol} · intraday ]</span>
        <span className="tabular-nums" style={{ color }}>
          ${displayCurrent?.toFixed(2)}
          {changePct != null && (
            <span className="ml-1 text-faint">
              {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
            </span>
          )}
        </span>
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="72"
        className="block"
        aria-hidden
      >
        {/* Fill */}
        {fillPath && (
          <path d={fillPath} fill={colorFaint} opacity="0.4" />
        )}

        {/* Prev-close baseline */}
        {pcY != null && (
          <line
            x1={PX} y1={pcY.toFixed(1)} x2={W - PX} y2={pcY.toFixed(1)}
            stroke="#454552" strokeWidth="0.5" strokeDasharray="3 3"
          />
        )}

        {/* Series line */}
        {pts.length > 1 && (
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        )}

        {/* Live dot */}
        {dotX != null && dotY != null && (
          <circle cx={dotX.toFixed(1)} cy={dotY.toFixed(1)} r="2.5" fill={color} />
        )}

        {/* Y labels */}
        {displayCurrent != null && dotY != null && dotX != null && (
          <text
            x={(dotX - 3).toFixed(1)}
            y={dotY < PY + 12 ? dotY + 10 : dotY - 3}
            fontSize="8" fill={color} textAnchor="end"
          >
            ${displayCurrent.toFixed(2)}
          </text>
        )}
        {displayPc != null && pcY != null && (
          <text x={PX + 2} y={pcY - 2} fontSize="7" fill="#454552" textAnchor="start">
            pc {displayPc.toFixed(2)}
          </text>
        )}
      </svg>
    </div>
  );
}
