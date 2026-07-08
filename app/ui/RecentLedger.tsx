"use client";

import { useState, useEffect, useCallback } from "react";
import { krSigned, shortDate } from "@/lib/format";
import { CategoryCommand } from "./CategoryCommand";
import { MarkRecurring, UnmarkRecurring } from "./RecurringActions";
import type { CatOption } from "./CategoryCommand";

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

/**
 * Overview "recent ledger" panel. Calls /api/transactions identically to the
 * full ledger so the recurring flag, category editing, and mark/unmark all
 * go through the exact same code path.
 */
export function RecentLedger({ options }: { options: CatOption[] }) {
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [version, setVersion] = useState(0);

  // Passed to mark/unmark actions so they trigger a re-fetch rather than just
  // a router.refresh() that would leave our local state stale.
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/transactions?limit=12")
      .then((r) => r.json())
      .then((data: { transactions: TxRow[] }) => {
        if (!cancelled) setRows(data.transactions ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (rows === null) {
    return (
      <p className="py-6 text-center text-sm text-muted">loading...</p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">No transactions yet.</p>
    );
  }

  return (
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
            const displayName = t.counterpartyName ?? t.remittance ?? "\u2014";
            return (
              <tr key={t.id} className={`group/row ${flagged ? "bg-danger/5" : ""}`}>
                <td className="w-16 whitespace-nowrap text-muted">
                  {shortDate(t.bookingDate)}
                </td>
                <td className="max-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-ink2">{displayName}</span>
                    {flagged && (
                      <span
                        className="tag tag-danger shrink-0"
                        title={t.flaggedReason ?? ""}
                      >
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
                    <UnmarkRecurring merchant={t.merchant} onSuccess={refetch} />
                  ) : t.direction === "DBIT" ? (
                    <MarkRecurring
                      txId={t.id}
                      merchant={displayName}
                      onSuccess={refetch}
                    />
                  ) : null}
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
    </div>
  );
}