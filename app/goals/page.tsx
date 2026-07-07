import { getGoals } from "@/lib/savings";
import { GoalRow, NewGoalForm } from "../ui/Goals";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Savings goals</h1>
        <p className="text-xs text-muted">
          One primary goal receives the monthly auto-sweep.
        </p>
      </header>

      {goals.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm text-muted">
            No goals yet. Add one to start tracking.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((g) => (
            <GoalRow key={g.id} {...g} />
          ))}
        </div>
      )}

      <NewGoalForm />
    </main>
  );
}
