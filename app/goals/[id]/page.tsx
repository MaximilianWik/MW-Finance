import { notFound } from "next/navigation";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getGoal, getGoals, getGoalContributions } from "@/lib/savings";
import { kr, shortDate } from "@/lib/format";
import { GoalActions } from "../../ui/GoalActions";
import { GoalAccounts } from "../../ui/GoalAccounts";
import { GoalSimulator } from "../../ui/GoalSimulator";
import { TrackTag } from "../../ui/Goals";
import { fmtMonthYear } from "@/lib/goal-math";
import { Panel } from "../../ui/Panel";
import { AsciiBar } from "../../ui/AsciiBar";
import { StatusTag } from "../../ui/StatusTag";
import { QueryLog } from "../../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function GoalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goalId = Number(id);
  if (!Number.isFinite(goalId)) notFound();

  const t0 = Date.now();
  const [[row, allGoals, contribs, savingsCat], queryLog] = await withQueryLog(() =>
    Promise.all([
      getGoal(goalId),
      getGoals(),
      getGoalContributions(goalId),
      db
        .select({ id: categories.id, budget: sql<number | null>`${categories.budgetMonthly}::float` })
        .from(categories)
        .where(eq(categories.name, "Savings"))
        .limit(1)
        .then((r) => r[0] ?? null),
    ])
  );
  const tookMs = Date.now() - t0;

  const g = allGoals.find((x) => x.id === goalId);
  if (!row || !g) notFound();

  const maxHist = Math.max(1, ...g.history.map((h) => Math.abs(h.amount)));

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="GOAL" />
      <a href="/goals" className="text-xs uppercase tracking-term text-muted hover:text-accent">
        « goals
      </a>

      <Panel title={`GOAL: ${g.name.toUpperCase()}`} right={g.isPrimary ? "PRIMARY" : undefined}>
        <div className="flex flex-col gap-4 md:flex-row">
          {g.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.imageUrl} alt={g.name} className="h-40 w-full border border-edge object-cover md:w-56" />
          )}
          <div className="flex flex-1 flex-col justify-center gap-2">
            <div className="text-lg tabular-nums text-ink2">
              {kr(g.current)} <span className="text-faint">/ {kr(g.target)}</span>
              <span className="ml-2 text-sm text-accent2">{Math.round(g.progressPct * 100)}%</span>
            </div>
            <AsciiBar ratio={g.progressPct} width={28} tone="accent2" />
            <p className="text-[0.65rem] uppercase tracking-term text-faint">
              accounts {kr(g.linkedValue)} · manual {kr(g.manualValue)} · left {kr(Math.max(0, g.target - g.current))}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {g.paused ? (
                <StatusTag tone="muted">PAUSED</StatusTag>
              ) : (
                <>
                  <span className="tabular-nums">
                    pace {kr(g.velocity)}/cycle · ETA <span className="text-ink2">{fmtMonthYear(g.etaDate)}</span>
                  </span>
                  <TrackTag track={g.track} pace={g.velocity} />
                </>
              )}
              {g.targetDate && <span>target {shortDate(g.targetDate)}</span>}
              {g.track.needed != null && g.track.state === "behind" && (
                <span>needs {kr(Math.ceil(g.track.needed))}/cycle</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-[0.65rem] uppercase tracking-term">
              {g.milestones.map((m) => (
                <span
                  key={m.pct}
                  className={`border px-2 py-0.5 ${m.reached ? "border-accent/50 text-accent" : "border-edge text-faint"}`}
                  title={kr(m.amount)}
                >
                  {m.pct}% {m.reached ? "✓" : fmtMonthYear(m.eta)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="FUNDING">
        <GoalAccounts goalId={g.id} />
      </Panel>

      <Panel title="PACE HISTORY" right={`median ${kr(g.velocity)}`}>
        {g.history.length === 0 ? (
          <p className="text-sm text-muted">No finished salary cycles yet.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {g.history.map((h) => (
                <tr key={h.from} className="border-b border-grid last:border-0">
                  <td className="w-40 whitespace-nowrap py-1 pr-3 text-faint">{h.label}</td>
                  <td className="py-1 pr-3">
                    <div
                      className={`h-2 ${h.amount >= 0 ? "bg-accent2/70" : "bg-danger/70"}`}
                      style={{ width: `${(Math.abs(h.amount) / maxHist) * 100}%` }}
                    />
                  </td>
                  <td className={`w-28 py-1 text-right ${h.amount >= 0 ? "text-ink2" : "text-danger"}`}>
                    {h.amount >= 0 ? "+" : ""}
                    {kr(h.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="pt-2 text-[0.6rem] uppercase tracking-term text-faint">
          deposits − withdrawals into the linked accounts (× share), plus manual contributions, per finished cycle
        </p>
      </Panel>

      <Panel title="SIMULATOR">
        <GoalSimulator
          current={g.current}
          target={g.target}
          pace={g.velocity}
          targetDate={g.targetDate}
          savingsCategoryId={savingsCat?.id ?? null}
          savingsBudget={savingsCat?.budget ?? null}
        />
      </Panel>

      <Panel title="ACTIONS">
        <GoalActions goalId={row.id} isPrimary={row.isPrimary} paused={row.paused} />
      </Panel>

      <Panel title="CONTRIBUTIONS" right={`${contribs.length}`}>
        {contribs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No manual contributions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="term-table">
              <tbody>
                {contribs.map((c) => (
                  <tr key={c.id}>
                    <td className="w-24 text-accent">+{kr(c.amount)}</td>
                    <td className="w-28">
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusTag tone={c.source === "sweep" ? "ok" : "muted"}>{c.source}</StatusTag>
                        {c.pending && <StatusTag tone="warn">PENDING</StatusTag>}
                      </div>
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
