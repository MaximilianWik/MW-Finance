import { getGoals } from "@/lib/savings";
import { GoalRow, NewGoalForm } from "../ui/Goals";
import { Panel } from "../ui/Panel";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const t0 = Date.now();
  const [[goals], queryLog] = await withQueryLog(() => Promise.all([getGoals()]));
  const tookMs = Date.now() - t0;

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="GOALS" />
      {goals.length === 0 ? (
        <Panel title="SAVINGS GOALS">
          <p className="text-sm text-muted">
            No goals yet. One primary goal receives the monthly auto-sweep.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <GoalRow key={g.id} {...g} />
          ))}
        </div>
      )}
      <NewGoalForm />
    </main>
  );
}
