"use client";

import { useState } from "react";
import { kr, krSigned, shortDate } from "@/lib/format";

interface Tx {
  id: number;
  bookingDate: string | null;
  counterpartyName: string | null;
  remittance: string | null;
  signed: number;
}

/**
 * Money in for the period, shown apart from the budget table (dashed accent
 * frame, own label) so it never reads as a budget line. Click to expand the
 * transactions behind the total. Gifts count once tagged Income in the ledger.
 */
export function IncomeRow({
  categoryId,
  total,
  range,
}: {
  categoryId: number;
  total: number;
  range: { from: string; to: string };
}) {
  const [open, setOpen] = useState(false);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || txs !== null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        categoryId: String(categoryId),
        from: range.from,
        to: range.to,
        limit: "100",
      });
      const res = await fetch(`/api/transactions?${params}`);
      const data = (await res.json()) as { transactions: Tx[] };
      setTxs(data.transactions);
    } catch {
      setTxs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 border border-dashed border-accent/40 bg-accent/[0.03]">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent/[0.06]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm uppercase tracking-term">
          <span className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}>{">"}</span>
          <span className="text-accent">income</span>
          <span className="text-[0.6rem] text-faint">not budgeted · money in this cycle</span>
        </span>
        <span className="tabular-nums text-accent">+{kr(total)}</span>
      </button>

      {open && (
        <div className="border-t border-dashed border-accent/30 px-3 pb-2 pt-1">
          {loading ? (
            <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">loading...</p>
          ) : !txs || txs.length === 0 ? (
            <p className="py-2 text-[0.7rem] uppercase tracking-term text-muted">no income this period.</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td className="w-16 whitespace-nowrap py-1 pr-2 text-faint">{shortDate(t.bookingDate)}</td>
                    <td className="max-w-0 py-1 pr-2">
                      <span className="block truncate text-muted">
                        {t.counterpartyName ?? t.remittance ?? "\u2014"}
                      </span>
                    </td>
                    <td
                      className={`w-24 whitespace-nowrap py-1 text-right ${
                        t.signed >= 0 ? "text-accent" : "text-ink2"
                      }`}
                    >
                      {krSigned(t.signed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="pt-1 text-[0.6rem] uppercase tracking-term text-faint">
            got a gift? set its category to income in the ledger and it counts here and in the budget.
          </p>
        </div>
      )}
    </div>
  );
}
