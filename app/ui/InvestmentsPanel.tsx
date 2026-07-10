"use client";

import { useCallback, useEffect, useState } from "react";
import { kr } from "@/lib/format";

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
  // Live-price peg (Phase 4b)
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

/**
 * Per-account investment balance tracker.
 *
 * Two flavours of account:
 *  • Transaction-tracked — a seed balance plus a delta from matching txns.
 *  • Price-pegged — linked to a stock ticker; value scales with the live quote:
 *      live_value = base_balance × (live_price / base_price)
 *    base_price is captured at the peg moment ("set balance" re-pegs it).
 */
export function InvestmentsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Live market data, keyed by ticker symbol (shared across accounts).
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [series, setSeries] = useState<Record<string, number[]>>({});

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/investments");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Poll live quotes + intraday candles for every linked ticker ──────────
  const tickers = Array.from(
    new Set((data?.accounts ?? []).map((a) => a.ticker).filter((t): t is string => !!t))
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
      // Append the live price as a tail point on each series (self-extending line).
      setSeries((prev) => {
        const next = { ...prev };
        for (const q of results) {
          if (!q) continue;
          const cur = next[q.symbol] ?? [];
          next[q.symbol] = [...cur, q.current].slice(-240);
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
            const { candles } = (await r.json()) as { candles: { points: { price: number }[] } };
            const base = candles.points.map((p) => p.price);
            if (!alive || base.length === 0) return;
            // Seed the series from Yahoo history only if we don't already have a
            // richer live tail; otherwise keep the accumulating live line.
            setSeries((prev) => {
              const existing = prev[s] ?? [];
              return existing.length > base.length ? prev : { ...prev, [s]: base };
            });
          } catch { /* ignore */ }
        })
      );
    }

    pullCandles();
    pullQuotes();
    const qi = setInterval(pullQuotes, 15_000);
    const ci = setInterval(pullCandles, 60_000);
    return () => { alive = false; clearInterval(qi); clearInterval(ci); };
  }, [tickerKey]);

  async function setBalance(id: number, ticker: string | null) {
    const val = Number(editVal);
    if (isNaN(val)) return;
    setBusy(true);
    const t = editTicker.trim().toUpperCase();
    const body: Record<string, unknown> = { id, balance: val };
    // Only send ticker/shares when the field is meaningful, so unrelated edits
    // don't accidentally clear the peg.
    if (t !== (ticker ?? "")) body.ticker = t || null;
    else if (t) body.ticker = t; // re-send to force a re-peg alongside the balance
    if (editShares.trim() !== "") body.shares = Number(editShares);
    const res = await fetch("/api/investments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { alert(`Update failed: ${(await res.json()).error ?? res.status}`); setBusy(false); return; }
    setEditId(null);
    await fetchAll();
    setBusy(false);
  }

  async function deleteAccount(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    await fetch(`/api/investments?id=${id}`, { method: "DELETE" });
    await fetchAll();
    setBusy(false);
  }

  async function addAccount() {
    if (!newName.trim()) return;
    setBusy(true);
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
    if (!res.ok) { alert(`Add failed: ${(await res.json()).error ?? res.status}`); setBusy(false); return; }
    setNewName(""); setNewBalance(""); setNewColor("#3ea0c8"); setNewTicker(""); setNewShares("");
    setAddOpen(false);
    await fetchAll();
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="panel">
        <span className="panel-title">[ INVESTMENTS ]</span>
        <p className="py-4 text-center text-sm text-muted">loading…</p>
      </div>
    );
  }

  const accounts = data?.accounts ?? [];

  // Live total uses scaled values for pegged accounts.
  const total = accounts.reduce((s, a) => s + liveValue(a, quotes[a.ticker ?? ""]), 0);

  return (
    <div className="panel">
      <span className="panel-title">[ INVESTMENTS ]</span>
      <span className="absolute -top-[0.62rem] right-3 bg-ink px-2 text-[0.7rem] uppercase tracking-term text-ink2">
        {kr(total)}
      </span>

      <div className="flex flex-col">
        {accounts.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            No accounts yet. Add one below.
          </p>
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
                  <span className="shrink-0 text-[0.75rem] uppercase tracking-term text-ink2"
                        style={{ color: acc.color }}>■</span>
                  <span className="text-[0.75rem] uppercase tracking-term text-ink2 mr-1">
                    {acc.name}
                  </span>
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
                    onChange={(e) => setEditTicker(e.target.value)}
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
                  <button
                    onClick={() => setBalance(acc.id, acc.ticker)}
                    disabled={busy}
                    className="btn btn-accent !py-0.5 !px-2 text-xs"
                  >
                    $ set
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="btn !py-0.5 !px-2 text-xs"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                /* ─── Display row ──────────────────── */
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-2 text-[0.75rem] uppercase tracking-term text-ink2">
                      <span style={{ color: acc.color }}>■</span>
                      {acc.name}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="tabular-nums text-sm font-medium text-ink2">
                        {kr(value)}
                      </span>
                      {pegged && (
                        <span
                          className="tabular-nums text-[0.7rem] font-medium"
                          style={{ color: up ? "#4ec96a" : "#e85252" }}
                        >
                          {up ? "▲" : "▼"} {up ? "+" : ""}{pegPct.toFixed(2)}%
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setEditId(acc.id);
                          setEditVal(String(acc.currentBalance));
                          setEditTicker(acc.ticker ?? "");
                          setEditShares(acc.shares != null ? String(acc.shares) : "");
                        }}
                        className="btn !py-0 !px-1.5 text-[0.65rem] opacity-50 hover:opacity-100"
                        title="Set balance / peg"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteAccount(acc.id, acc.name)}
                        disabled={busy}
                        className="btn btn-danger !py-0 !px-1.5 text-[0.65rem]"
                        title="Delete account"
                      >
                        del
                      </button>
                    </div>
                  </div>

                  {/* Price-peg detail: sparkline + ticker/shares + kr delta */}
                  {pegged && (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <Sparkline points={series[acc.ticker!] ?? []} up={up} />
                      <div className="text-right text-[0.65rem] tabular-nums text-faint">
                        <span style={{ color: up ? "#4ec96a" : "#e85252" }}>
                          {pegDelta >= 0 ? "+" : ""}{kr(pegDelta)}
                        </span>
                        <span className="ml-1 text-faint">
                          {acc.ticker}
                          {acc.shares != null ? ` · ${acc.shares} sh` : ""}
                        </span>
                        <span className="ml-1 text-faint/70">
                          @ ${quote!.current.toFixed(2)}
                          {quote!.changePct != null && ` (${quote!.changePct >= 0 ? "+" : ""}${quote!.changePct.toFixed(2)}% today)`}
                        </span>
                      </div>
                    </div>
                  )}
                  {acc.ticker && !pegged && (
                    <p className="mt-0.5 text-[0.65rem] text-faint">
                      {acc.basePrice ? "fetching live price…" : "no base price — re-peg via edit"}
                    </p>
                  )}

                  {/* Transaction-delta breakdown (non-pegged accounts) */}
                  {!acc.ticker && acc.txCount > 0 && (
                    <p className="mt-0.5 text-[0.65rem] tabular-nums text-faint">
                      {acc.delta >= 0 ? "+" : ""}{kr(acc.delta)} · {acc.txCount} transaction{acc.txCount !== 1 ? "s" : ""} since base
                      {acc.seedDate && (
                        <span className="ml-1 text-faint/60">({acc.seedDate})</span>
                      )}
                    </p>
                  )}
                  {!acc.ticker && acc.txCount === 0 && acc.merchant && (
                    <p className="mt-0.5 text-[0.65rem] text-faint">
                      no new transactions since base
                    </p>
                  )}
                </>
              )}
            </div>
            );
          })
        )}

        {/* ─── Total row ───────────────────────────── */}
        {accounts.length > 1 && (
          <div className="mt-2 flex justify-between border-t border-edge pt-2 text-xs uppercase tracking-term">
            <span className="text-muted">total</span>
            <span className="tabular-nums font-medium text-ink2">{kr(total)}</span>
          </div>
        )}

        {/* ─── Add account ─────────────────────────── */}
        {addOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
            <span className="text-xs uppercase tracking-term text-accent">$ new</span>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="NAME"
              className="input w-28 uppercase tracking-term"
            />
            <label className="prompt w-24">
              <span className="sigil text-faint">kr</span>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder="0"
                className="!w-full tabular-nums text-xs"
              />
            </label>
            <input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="TICKER"
              className="input w-20 uppercase tracking-term text-xs"
            />
            <input
              type="number"
              value={newShares}
              onChange={(e) => setNewShares(e.target.value)}
              placeholder="shares"
              className="input w-20 tabular-nums text-xs"
            />
            <button onClick={addAccount} disabled={busy || !newName.trim()} className="btn btn-accent">
              add
            </button>
            <button onClick={() => setAddOpen(false)} className="btn">cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 btn self-start text-xs"
          >
            + account
          </button>
        )}
      </div>
    </div>
  );
}

/** Scaled live value for a pegged account; plain balance otherwise. */
function liveValue(acc: AccountRow, quote: Quote | undefined): number {
  if (acc.ticker && acc.basePrice && quote && quote.current > 0) {
    return Math.round(acc.currentBalance * (quote.current / acc.basePrice) * 100) / 100;
  }
  return acc.currentBalance;
}

/** Minimal terminal-styled intraday sparkline. */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const W = 120, H = 26, P = 1;
  if (points.length < 2) {
    return <svg width={W} height={H} className="opacity-40" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (W - P * 2) / (points.length - 1);
  const y = (v: number) => H - P - ((v - min) / span) * (H - P * 2);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(P + i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const stroke = up ? "#4ec96a" : "#e85252";
  return (
    <svg width={W} height={H} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
