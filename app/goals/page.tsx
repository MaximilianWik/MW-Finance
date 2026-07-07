import { getGoals } from "@/lib/savings";
import { GoalRow, NewGoalForm } from "../ui/Goals";
import { Panel } from "../ui/Panel";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <main className="flex flex-col gap-4">
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
