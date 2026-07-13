import { getCategories } from "@/lib/queries";
import { getAllSalaryCycles } from "@/lib/period";
import { getChipContext } from "@/lib/game/rate";
import { Panel } from "../ui/Panel";
import { LedgerPanel } from "../ui/LedgerPanel";
import { AiConsole } from "../ui/AiConsole";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t0 = Date.now();
  const [[cats, cycles, ctx], queryLog] = await withQueryLog(() =>
    Promise.all([getCategories(), getAllSalaryCycles(), getChipContext()])
  );
  const tookMs = Date.now() - t0;
  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="LEDGER" />

      <Panel title="AI CATEGORIZE">
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          Run the categorization engine over your transactions — rules, learned
          merchants, then Gemini for the unknowns. Watch it type out live.
          <br />
          <span className="text-faint">
            &quot;$ categorize&quot; handles the uncategorized backlog. &quot;$ recategorize all&quot;
            re-runs everything except your manual overrides.
          </span>
        </p>
        <div className="flex flex-col gap-3">
          <AiConsole endpoint="/api/categorize" label="$ categorize" pendingLabel="categorizing…" />
          <AiConsole endpoint="/api/categorize?all=1" label="$ recategorize all" pendingLabel="categorizing…" />
        </div>
      </Panel>

      <Panel title="LEDGER">
        <LedgerPanel options={options} initialMonth={sp.month ?? ""} cycles={cycles} ctx={ctx} />
      </Panel>
    </main>
  );
}
