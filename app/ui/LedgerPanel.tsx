"use client";

import { useState, useRef } from "react";
import { kr, krSigned, shortDate } from "@/lib/format";
import { CategoryCommand, type CatOption } from "./CategoryCommand";
import { MarkRecurring, UnmarkRecurring } from "./RecurringActions";

interface TxRow {
  id: number;
  direction: string;
  amount: number;
  signed: number;
  currency: string;
  bookingDate: string | null;
  counterpartyName: string | null;
  remittance: string | null;
  merchant: string | null;
  categoryId: number | null;
  flaggedReason: string | null;
  recurring: boolean;
  categoryName: string | null;
  categoryColor: string | null;
}

interface Totals {
  totalIn: number;
  totalOut: number;
  count: number;
}

interface LedgerCycle {
  from: string;
  to: string | null;
  label: string;
}

interface Props {
  options: CatOption[];
  initialMonth?: string;
  cycles?: LedgerCycle[];
}

/**
 * Submit-based ledger panel.
 *
 * Holds all filter state locally. Only fetches when the user clicks "$ run".
 * Shows a query log (SQL-like preview → timing → row count) exactly like the
 * sync console.
 */
export function LedgerPanel({ options, initialMonth = "", cycles = [] }: Props) {
  // Filter state
  const [month,      setMonth]      = useState(initialMonth);
  const [categoryId, setCategoryId] = useState("");
  const [q,          setQ]          = useState("");
  const [minAmount,  setMinAmount]  = useState("");
  const [maxAmount,  setMaxAmount]  = useState("");
  const [period,     setPeriod]     = useState("");

  // Result state
  const [log,     setLog]     = useState<string[]>([]);
  const [rows,    setRows]    = useState<TxRow[] | null>(null);
  const [totals,  setTotals]  = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);

  // Track pending category changes
  const refreshKey = useRef(0);
  void refreshKey; // reserved for future optimistic updates

  function buildQueryLog(): string[] {
    const lines: string[] = [];
    const conditions: string[] = ["direction IN ('CRDT', 'DBIT')"];

    if (period && cycles[Number(period)]) {
      const c = cycles[Number(period)];
      conditions.push(
        `booking_date >= '${c.from}'${c.to ? ` AND booking_date <= '${c.to}'` : ""} -- L\u00d6N ${c.label}`
      );
    } else if (month) {
      const [y, m] = month.split("-");
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      conditions.push(`booking_date BETWEEN '${month}-01' AND '${month}-${lastDay}'`);
    }
    if (categoryId) {
      const cat = options.find((o) => String(o.id) === categoryId);
      conditions.push(`category_id = ${categoryId}${cat ? ` -- ${cat.name}` : ""}`);
    }
    if (q) conditions.push(`(counterparty_name || remittance || merchant) ILIKE '%${q}%'`);
    if (minAmount) conditions.push(`amount::float >= ${minAmount}`);
    if (maxAmount) conditions.push(`amount::float <= ${maxAmount}`);

    const indent = "  ";
    lines.push("> SELECT id, booking_date, counterparty_name,");
    lines.push(`${indent}       amount, direction, category_id`);
    lines.push(`${indent}FROM transactions`);
    lines.push(`${indent}  LEFT JOIN categories USING (id)`);
    if (conditions.length > 1) {
      lines.push(`${indent}WHERE ${conditions[0]}`);
      for (let i = 1; i < conditions.length; i++) {
        lines.push(`${indent}  AND ${conditions[i]}`);
      }
    } else {
      lines.push(`${indent}WHERE ${conditions[0]}`);
    }
    lines.push(`${indent}ORDER BY booking_date DESC`);
    lines.push(`${indent}LIMIT 500`);
    return lines;
  }

  async function run() {
    setLoading(true);
    const queryLines = buildQueryLog();
    setLog([...queryLines, "", "[EXEC] querying Neon Postgres..."]);
    setRows(null);
    setTotals(null);

    const params = new URLSearchParams({ limit: "500" });
    if (period && cycles[Number(period)]) {
      const c = cycles[Number(period)];
      params.set("from", c.from);
      if (c.to) params.set("to", c.to);
    } else if (month) {
      params.set("month", month);
    }
    if (categoryId) params.set("categoryId", categoryId);
    if (q)          params.set("q",          q);
    if (minAmount)  params.set("minAmount",  minAmount);
    if (maxAmount)  params.set("maxAmount",  maxAmount);

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json() as {
        transactions: TxRow[];
        totals: Totals;
        tookMs: number;
      };

      setRows(data.transactions);
      setTotals(data.totals);
      refreshKey.current++;

      const t = data.totals;
      const net = t.totalIn - t.totalOut;
      setLog([
        ...queryLines,
        "",
        `[DONE] ${t.count} row(s) · +${kr(t.totalIn)} in · −${kr(t.totalOut)} out · net ${krSigned(net)} — ${data.tookMs}ms`,
      ]);
    } catch (e) {
      setLog((l) => [...l, `[FAIL] ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Filter bar ───────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => { e.preventDefault(); run(); }}
        className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-term text-muted"
      >
        <span className="self-center text-accent">$ filter</span>

        <label className="prompt">
          <span className="sigil">--month</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="!w-36 text-xs uppercase tracking-term"
          />
        </label>

        {cycles.length > 0 && (
          <label className="prompt">
            <span className="sigil">{"--l\u00f6n"}</span>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                if (e.target.value) setMonth("");
              }}
              className="text-xs uppercase tracking-term"
              title="Filter by salary period (LÖN to next LÖN)"
            >
              <option value="">any</option>
              {cycles.map((c, i) => (
                <option key={i} value={String(i)}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="prompt">
          <span className="sigil">--cat</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="text-xs uppercase tracking-term"
          >
            <option value="">all</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>

        <label className="prompt flex-1 min-w-[10rem]">
          <span className="sigil">--search</span>
          <input
            type="text"
            value={q}
            placeholder="name / merchant…"
            onChange={(e) => setQ(e.target.value)}
            className="!w-full text-xs"
          />
        </label>

        <label className="prompt w-28">
          <span className="sigil">≥</span>
          <input
            type="number"
            min="0"
            value={minAmount}
            placeholder="min kr"
            onChange={(e) => setMinAmount(e.target.value)}
            className="!w-full tabular-nums text-xs"
          />
        </label>

        <label className="prompt w-28">
          <span className="sigil">≤</span>
          <input
            type="number"
            min="0"
            value={maxAmount}
            placeholder="max kr"
            onChange={(e) => setMaxAmount(e.target.value)}
            className="!w-full tabular-nums text-xs"
          />
        </label>

        <button type="submit" disabled={loading} className="btn btn-accent">
          {loading ? "running…" : "$ run"}
        </button>

        {(period || month || categoryId || q || minAmount || maxAmount) && (
          <button
            type="button"
            onClick={() => {
              setMonth(""); setPeriod(""); setCategoryId(""); setQ(""); setMinAmount(""); setMaxAmount("");
              setLog([]); setRows(null); setTotals(null);
            }}
            className="btn btn-danger text-[0.65rem]"
          >
            [ clear ]
          </button>
        )}
      </form>

      {/* ─── Query log ────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <pre className="overflow-x-auto whitespace-pre border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed">
          {log.map((l, i) => {
            const cls =
              l.startsWith("[FAIL]") ? "text-danger"
              : l.startsWith("[DONE]") ? "text-accent"
              : l.startsWith("[EXEC]") ? "text-amber"
              : l.startsWith(">")      ? "text-ink2"
              : "text-muted";
            return (
              <div key={i} className={cls}>
                {l}
                {loading && i === log.length - 1 && <span className="caret" />}
              </div>
            );
          })}
        </pre>
      )}

      {/* ─── Results ──────────────────────────────────────────────────── */}
      {rows !== null && (
        rows.length === 0 ? (
          <p className="border border-edge bg-panel px-4 py-8 text-center text-sm text-muted">
            No transactions match.
          </p>
        ) : (
          <div className="border border-edge bg-panel">
            <div className="border-b border-edge px-4 py-2 text-[0.7rem] uppercase tracking-term text-faint">
              {rows.length} rows shown
              {totals && (
                <>
                  {" "}· in{" "}
                  <span className="text-ok">+{kr(totals.totalIn)}</span>
                  {" "}· out{" "}
                  <span className="text-danger">−{kr(totals.totalOut)}</span>
                  {" "}· net{" "}
                  <span className={totals.totalIn - totals.totalOut >= 0 ? "text-ok" : "text-danger"}>
                    {krSigned(totals.totalIn - totals.totalOut)}
                  </span>
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="term-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>MERCHANT</th>
                    <th className="hidden sm:table-cell">CATEGORY</th>
                    <th className="hidden sm:table-cell"></th>
                    <th className="text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const inflow = t.signed >= 0;
                    const flagged = !!t.flaggedReason;
                    const displayName = t.counterpartyName ?? t.remittance ?? "—";
                    return (
                      <tr key={t.id} className={`group/row ${flagged ? "bg-danger/5" : ""}`}>
                        <td className="w-16 whitespace-nowrap text-muted">
                          {shortDate(t.bookingDate)}
                        </td>
                        <td className="max-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-ink2">{displayName}</span>
                            {flagged && (
                              <span className="tag tag-danger shrink-0" title={t.flaggedReason ?? ""}>
                                [!]
                              </span>
                            )}
                          </div>
                          {t.categoryName && (
                            <span
                              className="mt-0.5 block text-[0.62rem] uppercase tracking-term sm:hidden"
                              style={{ color: t.categoryColor ?? "#72728a" }}
                            >
                              {t.categoryName}
                            </span>
                          )}
                        </td>
                        <td className="hidden w-40 sm:table-cell">
                          <CategoryCommand
                            txId={t.id}
                            categoryId={t.categoryId}
                            options={options}
                          />
                        </td>
                        <td className="hidden w-24 text-center sm:table-cell">
                          {t.recurring ? (
                            <UnmarkRecurring merchant={t.merchant} />
                          ) : t.direction === "DBIT" ? (
                            <MarkRecurring txId={t.id} merchant={displayName} />
                          ) : null}
                        </td>
                        <td className={`w-24 text-right ${inflow ? "text-accent" : "text-ink2"}`}>
                          {krSigned(t.signed)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {rows === null && log.length === 0 && (
        <div className="border border-edge/50 bg-panel px-4 py-8 text-center text-sm text-muted">
          Set filters above and press <span className="text-accent">$ run</span> to query.
        </div>
      )}
    </div>
  );
}
