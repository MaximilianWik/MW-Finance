import { getCategories } from "@/lib/queries";
import { getAllSalaryCycles } from "@/lib/period";
import { Panel } from "../ui/Panel";
import { LedgerPanel } from "../ui/LedgerPanel";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [cats, cycles] = await Promise.all([getCategories(), getAllSalaryCycles()]);
  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  return (
    <main className="flex flex-col gap-4">
      <Panel title="LEDGER">
        <LedgerPanel options={options} initialMonth={sp.month ?? ""} cycles={cycles} />
      </Panel>
    </main>
  );
}
