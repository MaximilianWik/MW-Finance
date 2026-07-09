import { getCategories } from "@/lib/queries";
import { SimulateForm } from "../ui/SimulateForm";
import { Panel } from "../ui/Panel";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const t0 = Date.now();
  const [[cats], queryLog] = await withQueryLog(() => Promise.all([getCategories()]));
  const tookMs = Date.now() - t0;
  const options = cats
    .filter((c) => c.name !== "Income" && c.name !== "Transfers")
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="WHAT-IF" />
      <Panel title="WHAT-IF SIMULATION">
        <p className="mb-3 text-[0.7rem] uppercase tracking-term text-faint">
          Model a hypothetical purchase — see the adaptive redistribution as a diff.
        </p>
        <SimulateForm categories={options} />
      </Panel>
    </main>
  );
}
