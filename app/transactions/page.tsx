import { getCategories } from "@/lib/queries";
import { getAllSalaryCycles } from "@/lib/period";
import { Panel } from "../ui/Panel";
import { LedgerPanel } from "../ui/LedgerPanel";
import { AiConsole } from "../ui/AiConsole";

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
      <Panel title="AI CATEGORIZE">
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          Run the categorization engine over uncategorized transactions —
          rules, learned merchants, then Gemini for the unknowns. Watch it live.
        </p>
        <AiConsole endpoint="/api/categorize" label="$ categorize" pendingLabel="categorizing…" />
      </Panel>

      <Panel title="LEDGER">
        <LedgerPanel options={options} initialMonth={sp.month ?? ""} cycles={cycles} />
      </Panel>
    </main>
  );
}
