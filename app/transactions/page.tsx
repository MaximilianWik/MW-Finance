import { listTransactions, getCategories } from "@/lib/queries";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { Suspense } from "react";
import { TxRow } from "../ui/TxRow";
import { TxFilters } from "../ui/TxFilters";
import { BudgetBar } from "../ui/BudgetBar";
import { Panel } from "../ui/Panel";
import { kr, krSigned } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const month      = sp.month;
  const categoryId = sp.categoryId ? Number(sp.categoryId) : undefined;
  const q          = sp.q;
  const minAmount  = sp.minAmount ? Number(sp.minAmount) : undefined;
  const maxAmount  = sp.maxAmount ? Number(sp.maxAmount) : undefined;

  const [cats, { rows: txs, totals }, budget] = await Promise.all([
    getCategories(),
    listTransactions({ limit: 500, month, categoryId, q, minAmount, maxAmount }),
    // Only fetch budget status when a month filter is active.
    month ? getMonthlyBudgetStatus(new Date(month + "-15")) : Promise.resolve(null),
  ]);

  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const net = totals.totalIn - totals.totalOut;

  return (
    <main className="flex flex-col gap-4">
      <Suspense fallback={<div className="h-8" />}>
        <TxFilters options={options} />
      </Suspense>

      {/* Totals bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border border-edge bg-panel px-4 py-2 text-xs uppercase tracking-term">
        <span className="text-muted">
          {totals.count} {totals.count === 1 ? "tx" : "txns"}
        </span>
        <span>
          <span className="text-muted">in  </span>
          <span className="text-ok tabular-nums">+{kr(totals.totalIn)}</span>
        </span>
        <span>
          <span className="text-muted">out </span>
          <span className="text-danger tabular-nums">−{kr(totals.totalOut)}</span>
        </span>
        <span>
          <span className="text-muted">net </span>
          <span className={`tabular-nums ${net >= 0 ? "text-ok" : "text-danger"}`}>
            {krSigned(net)}
          </span>
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title="LEDGER" right={`${totals.count} ROWS`}>
          {txs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No transactions match.</p>
          ) : (
            <table className="term-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>MERCHANT</th>
                  <th>CATEGORY</th>
                  <th></th>
                  <th className="text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <TxRow key={t.id} tx={t} options={options} />
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Budget breakdown — only when month is selected */}
        {budget && (
          <Panel
            title={`BUDGET · ${budget.label}`}
            right={`${kr(budget.totalSpent)} / ${kr(budget.totalBudget)}`}
          >
            <div className="divide-y divide-grid">
              {budget.rows
                .filter((r) => r.budget != null || r.spent > 0)
                .map((r) => (
                  <BudgetBar key={r.categoryId} row={r} />
                ))}
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}
