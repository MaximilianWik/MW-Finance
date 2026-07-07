import { listTransactions, getCategories } from "@/lib/queries";
import { Suspense } from "react";
import { TxRow } from "../ui/TxRow";
import { TxFilters } from "../ui/TxFilters";
import { Panel } from "../ui/Panel";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cats = await getCategories();
  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  const txs = await listTransactions({
    limit: 300,
    month: sp.month,
    categoryId: sp.categoryId ? Number(sp.categoryId) : undefined,
  });

  return (
    <main className="flex flex-col gap-4">
      <Suspense fallback={<div className="h-8" />}>
        <TxFilters options={options} />
      </Suspense>

      <Panel title="LEDGER" right={`${txs.length} ROWS`}>
        {txs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No transactions match.</p>
        ) : (
          <table className="term-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>MERCHANT</th>
                <th>CATEGORY</th>
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
    </main>
  );
}
