import { notFound } from "next/navigation";
import { getGoal, getGoals, getGoalContributions } from "@/lib/savings";
import { kr, shortDate } from "@/lib/format";
import { GoalActions } from "../../ui/GoalActions";

export const dynamic = "force-dynamic";

export default async function GoalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goalId = Number(id);
  if (!Number.isFinite(goalId)) notFound();

  const [row, allGoals, contribs] = await Promise.all([
    getGoal(goalId),
    getGoals(),
    getGoalContributions(goalId),
  ]);
  if (!row) notFound();
  const summary = allGoals.find((g) => g.id === goalId);

  const target = Number(row.targetAmount);
  const current = Number(row.currentAmount);
  const progressPct = target > 0 ? Math.min(1, current / target) : 0;

  return (
    <main className="flex flex-col gap-4">
      <header>
        <a href="/goals" className="text-xs text-muted hover:text-white">
          ← Goals
        </a>
        <h1 className="mt-1 text-xl font-semibold">{row.name}</h1>
        {row.targetDate && (
          <p className="text-xs text-muted">target date · {shortDate(row.targetDate)}</p>
        )}
      </header>

      {row.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.imageUrl}
          alt={row.name}
          className="h-48 w-full rounded-xl object-cover"
        />
      )}

      <section className="card">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Progress</span>
          <span className="text-lg font-semibold tabular-nums">
            {kr(current)} / {kr(target)}
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.max(progressPct * 100, 2)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{Math.round(progressPct * 100)}% funded</span>
          {summary && summary.velocity > 0 ? (
            <span>
              {kr(summary.velocity)}/mo ·{" "}
              {summary.monthsToGoal != null && summary.monthsToGoal < 240
                ? Math.ceil(summary.monthsToGoal) + " months to go"
                : "—"}
            </span>
          ) : (
            <span>No velocity yet — add a contribution</span>
          )}
        </div>
      </section>

      <GoalActions
        goalId={row.id}
        isPrimary={row.isPrimary}
        paused={row.paused}
      />

      <section className="card">
        <h2 className="mb-2 font-medium">Contributions</h2>
        {contribs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-edge/40">
            {contribs.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    +{kr(c.amount)}
                    <span
                      className={
                        "ml-2 rounded px-1 text-[10px] uppercase " +
                        (c.source === "sweep"
                          ? "bg-emerald-400/20 text-emerald-400"
                          : "bg-accent/20 text-accent")
                      }
                    >
                      {c.source}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {c.createdAt
                      ? new Date(c.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </span>
                </div>
                {c.note && <p className="text-[11px] text-muted">{c.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
