import { getMonthlyBudgetStatus, getWeeklyBudgetStatus, weekRange } from "@/lib/budget";
import { getAllSalaryCycles } from "@/lib/period";
import { BudgetEditor, type EditableCategory } from "../ui/BudgetEditor";
import { BudgetBar } from "../ui/BudgetBar";
import { BudgetCycleNav } from "../ui/BudgetCycleNav";
import { Panel } from "../ui/Panel";
import { RecalibratePanel } from "../ui/RecalibratePanel";
import { getCategories } from "@/lib/queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cycleFrom = sp.cycle; // YYYY-MM-DD from of a past salary cycle

  // Determine the reference date for the selected cycle. Passing a date
  // anywhere inside the cycle's range makes getSalaryCycle find it correctly.
  const ref = cycleFrom ? new Date(cycleFrom + "T12:00:00Z") : new Date();
  const isCurrentCycle = !cycleFrom;

  const [cats, status, weekly, cycles] = await Promise.all([
    getCategories(),
    getMonthlyBudgetStatus(ref),
    // Weekly status only makes sense for the current cycle.
    isCurrentCycle ? getWeeklyBudgetStatus() : Promise.resolve(null),
    getAllSalaryCycles(),
  ]);

  const spentByCat = new Map(status.rows.map((r) => [r.categoryId, r.spent]));

  const rows: EditableCategory[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    budgetMonthly: c.budgetMonthly,
    budgetWeekly: c.budgetWeekly,
    spent: spentByCat.get(c.id) ?? 0,
  }));

  // Budgeted categories first (has a monthly budget set), then by existing sort order.
  const monthlyRows = status.rows
    .filter((r) => r.name !== "Transfers")
    .sort((a, b) => {
      const aB = a.budget != null ? 1 : 0;
      const bB = b.budget != null ? 1 : 0;
      return bB - aB; // stable within each group (JS sort is stable)
    });
  const todayIso = new Date().toISOString().slice(0, 10);
  const mr = { from: status.from || todayIso, to: status.to ?? todayIso };
  const wr = weekRange();

  // The "current" from for the nav: if a past cycle is selected use its from;
  // otherwise use the first (latest) detected cycle's from so the selector
  // shows the right option as selected.
  const displayFrom = cycleFrom ?? cycles[0]?.from ?? "";

  return (
    <main className="flex flex-col gap-4">
      <Panel title="AI BUDGET">
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          The engine reads your income, spending habits and recurring bills, then proposes
          realistic monthly budgets. Manually-set limits are never overwritten. Add optional
          guidance below to steer it.
        </p>
        <RecalibratePanel />
      </Panel>

      <Panel
        title="MONTHLY BUDGET"
        right={`${kr(status.totalSpent)} / ${kr(status.totalBudget)}`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.7rem] uppercase tracking-term text-faint">{status.label}</p>
          <BudgetCycleNav cycles={cycles} currentFrom={displayFrom} />
        </div>
        {!isCurrentCycle && (
          <p className="mb-2 text-[0.65rem] text-faint">
            [ HISTORICAL ] budgets shown are your current limits applied to that period&apos;s spending.
          </p>
        )}
        <div className="divide-y divide-grid">
          {monthlyRows.map((r) => (
            <BudgetBar key={r.categoryId} row={r} range={{ from: mr.from, to: mr.to }} />
          ))}
        </div>
      </Panel>

      {weekly && weekly.rows.length > 0 && (
        <Panel
          title="WEEKLY BUDGET"
          right={`${kr(weekly.totalSpent)} / ${kr(weekly.totalBudget)}`}
        >
          <p className="mb-2 text-[0.7rem] uppercase tracking-term text-faint">{weekly.label}</p>
          <div className="divide-y divide-grid">
            {weekly.rows.map((r) => (
              <BudgetBar
                key={r.categoryId}
                range={{ from: wr.from, to: wr.to }}
                row={{
                  categoryId: r.categoryId,
                  name: r.name,
                  color: r.color,
                  budget: r.budget,
                  baseBudget: r.budget,
                  adjustment: 0,
                  spent: r.spent,
                  remaining: r.remaining,
                  pct: r.pct,
                }}
              />
            ))}
          </div>
        </Panel>
      )}

      <Panel title="EDIT LIMITS">
        <BudgetEditor categories={rows} />
      </Panel>
    </main>
  );
}
