"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
 * bills = budget follows the bills checklist, not editable.
 * fixed = editable by hand, never changed by AI recalibration or adaptive moves.
 */
export type BudgetLock = "bills" | "fixed" | null;

/** One bill in the Bills row overview (from the bills checklist). */
export interface BillOverview {
  id: number;
  name: string;
  amount: number;
  monthly: number; // what the limit counts this cycle (variable bills: estimate or actual)
  basis: "fixed" | "paid" | "last-year" | "median";
  cadence: string;
  expectedOn: string | null;
  paidOnDate: string | null;
  state: "paid" | "due" | "overdue" | "upcoming" | "missed";
}

const BASIS_LABEL: Record<Exclude<BillOverview["basis"], "fixed">, { text: string; title: string }> = {
  paid: { text: "actual", title: "Variable bill: the limit uses what you paid this cycle" },
  "last-year": { text: "est. last yr", title: "Variable bill: estimated from the same period last year" },
  median: { text: "est. median", title: "Variable bill: estimated from the median of past payments" },
};

const BILL_TONE: Record<BillOverview["state"], string> = {
  paid: "tag-ok", due: "tag-muted", overdue: "tag-danger", upcoming: "tag-muted", missed: "tag-danger",
};

// Mirror of UNDELETABLE in src/lib/budget-rules.ts (server-only module).
const UNDELETABLE = new Set(["Uncategorized", "Income", "Transfers", "Savings", "Bills & Utilities"]);

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; msg: string };

/**
 * One budget line, rendered as a table row so every column (name, amount, bar,
 * percent) aligns across rows regardless of content width.
 *
 * Must be rendered inside a <tbody>. When `range` is supplied the row is
 * clickable: it expands a second row that lazy-fetches that category's
 * transactions for the period. When `editable` is set (current cycle) the
 * limit is an inline input, and the expanded row has colour + delete.
 */
export function BudgetBar({
  row,
  range,
  editable = false,
  lock = null,
  bills,
  uncategorizedBills = 0,
}: {
  row: CategoryBudget;
  range?: { from: string; to: string };
  editable?: boolean;
  lock?: BudgetLock;
  bills?: BillOverview[];
  uncategorizedBills?: number; // checklist bills with no category: not counted
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [txs, setTxs] = useState<DrillTx[] | null>(null);
  const [loading, setLoading] = useState(false);

  const initialLimit = row.baseBudget != null ? String(Math.round(row.baseBudget)) : "";
  const [limit, setLimit] = useState(initialLimit);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [color, setColor] = useState(row.color);

  const hasBudget = row.budget != null && row.budget > 0;
  const ratio    = hasBudget ? row.pct ?? 0 : 0;
  const over     = (row.pct ?? 0) > 1;
  const adjusted = row.adjustment !== 0;
  const canDrill = !!range;
  const canEditLimit = editable && lock !== "bills";

  async function patch(body: Record<string, unknown>): Promise<string | null> {
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.categoryId, ...body }),
    });
    if (res.ok) return null;
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return error ?? `HTTP ${res.status}`;
  }

  async function saveLimit() {
    const value = limit.trim();
    if (value === initialLimit) return;
    if (value !== "" && (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 0)) {
      setSave({ kind: "error", msg: "not a number" });
      return;
    }
    setSave({ kind: "saving" });
    const err = await patch({ budgetMonthly: value === "" ? null : value });
    if (err) {
      setSave({ kind: "error", msg: err });
      return;
    }
    setSave({ kind: "saved" });
    start(() => router.refresh());
  }

  async function saveColor(next: string) {
    setColor(next);
    const err = await patch({ color: next });
    if (!err) start(() => router.refresh());
  }

  async function del() {
    if (!confirm(`Delete "${row.name}"? Transactions in it become uncategorized (history is kept).`)) return;
    const res = await fetch(`/api/categories?id=${row.categoryId}`, { method: "DELETE" });
    if (res.ok) start(() => router.refresh());
    else {
      const { error } = await res.json().catch(() => ({ error: "delete failed" }));
      alert(error ?? "delete failed");
    }
  }

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
            <span className="shrink-0" style={{ color }}>{"\u25a0"}</span>
            <span className="text-ink2">{row.name}</span>
          </span>
        </td>

        {/* AMOUNT: spent / limit (inline-editable on the current cycle) */}
        <td className="whitespace-nowrap py-1.5 pr-3 text-right align-middle tabular-nums text-muted">
          {kr(row.spent)}
          {canEditLimit ? (
            <span className="text-faint">
              {" / "}
              <input
                type="text"
                inputMode="numeric"
                value={limit}
                placeholder="—"
                aria-label={`${row.name} monthly limit`}
                title={adjusted ? `Base limit. Adaptive adjustment this cycle: ${krSigned(row.adjustment)}` : "Monthly limit"}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  setLimit(e.target.value);
                  if (save.kind !== "saving") setSave({ kind: "idle" });
                }}
                onBlur={saveLimit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setLimit(initialLimit);
                    setSave({ kind: "idle" });
                  }
                }}
                className={`input !inline-block w-20 !px-1.5 !py-0.5 text-right text-sm tabular-nums ${
                  save.kind === "error" ? "!border-danger" : ""
                }`}
              />
              <span className="ml-1 inline-block w-4 text-left">
                {save.kind === "saving" && <span className="text-faint">…</span>}
                {save.kind === "saved" && <span className="text-ok">✓</span>}
                {save.kind === "error" && (
                  <span className="text-danger" title={save.msg}>!</span>
                )}
              </span>
            </span>
          ) : (
            hasBudget && <span className="text-faint"> / {kr(row.budget)}</span>
          )}
        </td>

        <td className="hidden py-1.5 pr-3 align-middle sm:table-cell">
          {hasBudget ? (
            <AsciiBar ratio={ratio} width={16} barColor={color} />
          ) : (
            <span className="text-faint">[ no budget ]</span>
          )}
        </td>

        {/* Tags */}
        <td className="whitespace-nowrap py-1.5 text-right align-middle">
          {lock === "bills" && (
            <span className="tag tag-muted" title="Locked to the bills checklist (recurring payments)">
              [ BILLS ]
            </span>
          )}
          {lock === "fixed" && (
            <span className="tag tag-muted" title="Never changed by AI recalibration or the adaptive budget">
              [ FIXED ]
            </span>
          )}
          {adjusted && (
            <span
              className={`tag ml-1 ${row.adjustment > 0 ? "tag-ok" : "tag-warn"}`}
              title={`Adaptive adjustment ${row.adjustment > 0 ? "+" : ""}${kr(row.adjustment)}`}
            >
              {row.adjustment > 0 ? "+" : ""}
              {Math.round(row.adjustment)}
            </span>
          )}
          {over && <span className="tag tag-danger ml-1">[ OVER ]</span>}
        </td>
      </tr>

      {save.kind === "error" && (
        <tr>
          <td colSpan={4} className="pb-1 pl-6 text-[0.65rem] text-danger">
            [FAIL] {row.name}: {save.msg}
          </td>
        </tr>
      )}

      {open && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="mb-2 ml-6 border-l border-grid pl-3">
              {editable && (
                <div className="flex items-center gap-3 py-1.5 text-[0.65rem] uppercase tracking-term text-faint">
                  <label className="flex items-center gap-1.5">
                    colour
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => saveColor(e.target.value)}
                      className="h-4 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                  {lock === "bills" && <span>limit = bills checklist total</span>}
                  {!UNDELETABLE.has(row.name) && (
                    <button onClick={del} className="btn btn-danger !px-1.5 !py-0.5 text-[0.6rem]">
                      delete category
                    </button>
                  )}
                </div>
              )}
              {bills && (
                <div className="mb-2 border-b border-grid pb-2">
                  <p className="py-1 text-[0.6rem] uppercase tracking-term text-faint">
                    bills this month · {bills.filter((b) => b.state === "paid").length}/{bills.length} paid
                  </p>
                  {bills.length === 0 ? (
                    <p className="py-1 text-[0.7rem] uppercase tracking-term text-muted">
                      no recurring payments in this category yet.
                    </p>
                  ) : (
                    <table className="w-full text-sm tabular-nums">
                      <tbody>
                        {bills.map((b) => (
                          <tr key={b.id}>
                            <td className="w-16 whitespace-nowrap py-1 pr-2 text-faint">
                              {shortDate(b.paidOnDate ?? b.expectedOn)}
                            </td>
                            <td className="max-w-0 py-1 pr-2">
                              <span className="block truncate text-ink2">{b.name}</span>
                            </td>
                            <td className="hidden whitespace-nowrap py-1 pr-2 text-[0.65rem] uppercase text-faint sm:table-cell">
                              {b.cadence}
                              {b.cadence !== "monthly" && ` · ${kr(b.monthly)}/mo`}
                              {b.basis !== "fixed" && (
                                <span className="ml-1 text-amber" title={BASIS_LABEL[b.basis].title}>
                                  · {BASIS_LABEL[b.basis].text}
                                </span>
                              )}
                            </td>
                            <td className="w-24 whitespace-nowrap py-1 pr-2 text-right text-muted">
                              {kr(b.basis === "fixed" ? b.amount : b.monthly)}
                            </td>
                            <td className="w-20 whitespace-nowrap py-1 text-right">
                              <span className={`tag ${BILL_TONE[b.state]}`}>{b.state}</span>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-grid">
                          <td colSpan={3} className="py-1 pr-2 text-[0.65rem] uppercase tracking-term text-faint">
                            monthly total = limit
                          </td>
                          <td className="py-1 pr-2 text-right text-ink2">
                            {kr(bills.reduce((s, b) => s + b.monthly, 0))}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  )}
                  {uncategorizedBills > 0 && (
                    <p className="pt-1 text-[0.65rem] text-amber">
                      [!] {uncategorizedBills} recurring payment(s) have no category and aren&apos;t counted. set
                      their category on /insights.
                    </p>
                  )}
                </div>
              )}
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
