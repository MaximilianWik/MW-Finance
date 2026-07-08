import { notFound } from "next/navigation";
import { getGoal, getGoals, getGoalContributions } from "@/lib/savings";
import { kr, shortDate } from "@/lib/format";
import { GoalActions } from "../../ui/GoalActions";
import { Panel } from "../../ui/Panel";
import { AsciiBar } from "../../ui/AsciiBar";
import { StatusTag } from "../../ui/StatusTag";

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
      <a href="/goals" className="text-xs uppercase tracking-term text-muted hover:text-accent">
        « goals
      </a>

      <Panel
        title={`GOAL: ${row.name.toUpperCase()}`}
        right={row.isPrimary ? "PRIMARY" : undefined}
      >
        <div className="flex flex-col gap-4 md:flex-row">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageUrl}
              alt={row.name}
              className="h-40 w-full border border-edge object-cover md:w-56"
            />
          )}
          <div className="flex flex-1 flex-col justify-center gap-2">
            <div className="text-lg tabular-nums text-ink2">
              {kr(current)} <span className="text-faint">/ {kr(target)}</span>
            </div>
            <AsciiBar ratio={progressPct} width={28} tone="accent2" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {row.targetDate && <span>target {shortDate(row.targetDate)}</span>}
              {summary && summary.velocity > 0 ? (
                <StatusTag tone="ok">
                  {kr(summary.velocity)}/MO ·{" "}
                  {summary.monthsToGoal != null && summary.monthsToGoal < 240
                    ? Math.ceil(summary.monthsToGoal) + "MO LEFT"
                    : "—"}
                </StatusTag>
              ) : (
                <StatusTag tone="muted">NO VELOCITY</StatusTag>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="ACTIONS">
        <GoalActions goalId={row.id} isPrimary={row.isPrimary} paused={row.paused} />
      </Panel>

      <Panel title="CONTRIBUTIONS" right={`${contribs.length}`}>
        {contribs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="term-table">
              <tbody>
                {contribs.map((c) => (
                  <tr key={c.id}>
                    <td className="w-24 text-accent">+{kr(c.amount)}</td>
                    <td className="w-20">
                      <StatusTag tone={c.source === "sweep" ? "ok" : "muted"}>{c.source}</StatusTag>
                    </td>
                    <td className="text-muted">{c.note}</td>
                    <td className="w-20 text-right text-faint">
                      {c.createdAt ? shortDate(new Date(c.createdAt).toISOString().slice(0, 10)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
