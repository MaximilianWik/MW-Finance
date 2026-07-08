"use client";

import { useState } from "react";
import { kr, krSigned, shortDate } from "@/lib/format";
import { AsciiBar } from "./AsciiBar";
import type { CategoryBudget } from "@/lib/budget";

interface DrillTx {
  id: number;
  bookingDate: string | null;
  counterpartyName: string | null;
  remittance: string | null;
  signed: number;
  direction: string;
}

/**
 * One budget line, rendered as a table row so every column (name, amount, bar,
 * percent) aligns across rows regardless of content width.
 *
 * Must be rendered inside a <tbody>. When `range` is supplied the row is
 * clickable: it expands a second row that lazy-fetches that category's
 * transactions for the period.
 */
export function BudgetBar({
  row,
  range,
}: {
  row: CategoryBudget;
  range?: { from: string; to: string };
}) {
  const [open, setOpen] = useState(false);
  const [txs, setTxs] = useState<DrillTx[] | null>(null);
  const [loading, setLoading] = useState(false);

  const hasBudget = row.budget != null && row.budget > 0;
  const ratio = hasBudget ? row.pct ?? 0 : 0;
  const over = (row.pct ?? 0) > 1;
  const adjusted = row.adjustment !== 0;
  const canDrill = !!range;
  const pctNum = hasBudget && row.pct != null ? Math.round(row.pct * 100) : null;

  async function toggle() {
    if (!canDrill) return;
    const next = !open;
    setOpen(next);
    if (next && txs === null) {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          categoryId: String(row.categoryId),
          from: range!.from,
          to: range!.to,
          limit: "100",
        });
        const res = await fetch(`/api/transactions?${params}`);
        const data = (await res.json()) as { transactions: DrillTx[] };
        setTxs(data.transactions);
      } catch {
        setTxs([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <tr
        onClick={toggle}
        className={`border-b border-grid text-sm ${
          canDrill ? "cursor-pointer hover:bg-panel2/40" : ""
        }`}
      >
        {/* NAME */}
        <td className="py-1.5 pr-3 align-middle">
          <span className="flex items-center gap-2 uppercase tracking-term">
            {canDrill && (
              <span className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}>
                {">"}
              </span>
            )}
            <span className="shrink-0" style={{ color: row.color }}>{"\u25a0"}</span>
            <span className="text-ink2">{row.name}</span>
          </span>
        </td>

        {/* AMOUNT */}
        <td className="whitespace-nowrap py-1.5 pr-3 text-right align-middle tabular-nums text-muted">
          {kr(row.spent)}
          {hasBudget && <span className="text-faint"> / {kr(row.budget)}</span>}
        </td>

        {/* BAR — desktop only */}
        <td className="hidden py-1.5 pr-3 align-middle sm:table-cell">
          {hasBudget ? (
            <AsciiBar ratio={ratio} width={16} barColor={row.color} showPct={false} />
          ) : (
            <span className="text-faint">[ no budget ]</span>
          )}
        </td>

        {/* PERCENT + tags */}
        <td className="whitespace-nowrap py-1.5 text-right align-middle tabular-nums">
          {pctNum != null &&
            (over ? (
              <span className="text-danger">{pctNum}%</span>
            ) : (
              <span style={{ color: row.color }}>{pctNum}%</span>
            ))}
          {adjusted && (
            <span
              className={`tag ml-2 ${row.adjustment > 0 ? "tag-ok" : "tag-warn"}`}
              title={`Adaptive adjustment ${row.adjustment > 0 ? "+" : ""}${kr(row.adjustment)}`}
            >
              {row.adjustment > 0 ? "+" : ""}
              {Math.round(row.adjustment)}
            </span>
          )}
          {over && <span className="tag tag-danger ml-2">[ OVER ]</span>}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="mb-2 ml-6 border-l border-grid pl-3">
              {loading ? (
                <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">loading...</p>
              ) : !txs || txs.length === 0 ? (
                <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">
                  no transactions this period.
                </p>
              ) : (
                <table className="w-full text-sm tabular-nums">
                  <tbody>
                    {txs.map((t) => {
                      const name = t.counterpartyName ?? t.remittance ?? "\u2014";
                      const inflow = t.signed >= 0;
                      return (
                        <tr key={t.id}>
                          <td className="w-16 whitespace-nowrap py-1 pr-2 text-faint">
                            {shortDate(t.bookingDate)}
                          </td>
                          <td className="max-w-0 py-1 pr-2">
                            <span className="block truncate text-muted">{name}</span>
                          </td>
                          <td
                            className={`w-24 whitespace-nowrap py-1 text-right ${
                              inflow ? "text-accent" : "text-ink2"
                            }`}
                          >
                            {krSigned(t.signed)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
