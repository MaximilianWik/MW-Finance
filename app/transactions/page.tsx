import { listTransactions, getCategories } from "@/lib/queries";
import { Suspense } from "react";
import { TxRow } from "../ui/TxRow";
import { TxFilters } from "../ui/TxFilters";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cats = await getCategories();
  const options = cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
  }));

  const txs = await listTransactions({
    limit: 300,
    month: sp.month,
    categoryId: sp.categoryId ? Number(sp.categoryId) : undefined,
  });

  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-xs text-muted">{txs.length} transactions</p>
      </header>

      <Suspense fallback={<div className="h-10" />}>
        <TxFilters options={options} />
      </Suspense>

      <section className="card">
        {txs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No transactions match.</p>
        ) : (
          <ul>
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} options={options} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
