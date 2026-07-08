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
 * One budget line rendered as terminal output: NAME  spent/budget  [bar] %.
 *
 * When `range` is supplied the row is clickable: it expands in place and
 * lazy-fetches that category's transactions for the period from
 * /api/transactions?categoryId&from&to.
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
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={!canDrill}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-left text-sm ${
          canDrill ? "cursor-pointer hover:bg-panel2/40" : "cursor-default"
        }`}
      >
        <span className="flex min-w-[11rem] shrink-0 items-center gap-2 uppercase tracking-term">
          {canDrill && (
            <span
              className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}
            >
              {">"}
            </span>
          )}
          <span style={{ color: row.color }}>{"\u25a0"}</span>
          <span className="text-ink2">{row.name}</span>
        </span>

        <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-muted">
          {kr(row.spent)}
          {hasBudget && <span className="text-faint"> / {kr(row.budget)}</span>}
        </span>

        {hasBudget ? (
          <AsciiBar ratio={ratio} width={16} barColor={row.color} />
        ) : (
          <span className="text-faint">[ no budget ]</span>
        )}

        {adjusted && (
          <span
            className={`tag ${row.adjustment > 0 ? "tag-ok" : "tag-warn"}`}
            title={`Adaptive adjustment ${row.adjustment > 0 ? "+" : ""}${kr(row.adjustment)}`}
          >
            {row.adjustment > 0 ? "+" : ""}
            {Math.round(row.adjustment)}
          </span>
        )}
        {over && <span className="tag tag-danger">[ OVER BUDGET ]</span>}
      </button>

      {open && (
        <div className="mb-2 ml-6 border-l border-grid pl-3">
          {loading ? (
            <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">loading...</p>
          ) : !txs || txs.length === 0 ? (
            <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">
              no transactions this period.
            </p>
          ) : (
            <table className="term-table">
              <tbody>
                {txs.map((t) => {
                  const name = t.counterpartyName ?? t.remittance ?? "\u2014";
                  const inflow = t.signed >= 0;
                  return (
                    <tr key={t.id}>
                      <td className="w-16 whitespace-nowrap text-faint">
                        {shortDate(t.bookingDate)}
                      </td>
                      <td className="max-w-0">
                        <span className="truncate text-muted">{name}</span>
                      </td>
                      <td
                        className={`w-24 text-right ${inflow ? "text-accent" : "text-ink2"}`}
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
      )}
    </div>
  );
}