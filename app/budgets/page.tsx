import { getMonthlyBudgetStatus, getWeeklyBudgetStatus, weekRange } from "@/lib/budget";
import { BudgetEditor, type EditableCategory } from "../ui/BudgetEditor";
import { BudgetBar } from "../ui/BudgetBar";
import { Panel } from "../ui/Panel";
import { AiConsole } from "../ui/AiConsole";
import { getCategories } from "@/lib/queries";
import { kr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [cats, status, weekly] = await Promise.all([
    getCategories(),
    getMonthlyBudgetStatus(),
    getWeeklyBudgetStatus(),
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

  const monthlyRows = status.rows.filter((r) => r.name !== "Transfers" && (r.budget != null || r.spent > 0));
  const todayIso = new Date().toISOString().slice(0, 10);
  const mr = { from: status.from || todayIso, to: status.to ?? todayIso };
  const wr = weekRange();

  return (
    <main className="flex flex-col gap-4">
      <Panel title="MONTHLY BUDGET" right={`${kr(status.totalSpent)} / ${kr(status.totalBudget)}`}>
        <p className="mb-2 text-[0.7rem] uppercase tracking-term text-faint">{status.label}</p>
        <div className="divide-y divide-grid">
          {monthlyRows.map((r) => (
            <BudgetBar key={r.categoryId} row={r} range={{ from: mr.from, to: mr.to }} />
          ))}
        </div>
      </Panel>

      {weekly.rows.length > 0 && (
        <Panel title="WEEKLY BUDGET" right={`${kr(weekly.totalSpent)} / ${kr(weekly.totalBudget)}`}>
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

      <Panel title="AI BUDGET">
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          The engine reads your income, spending habits and recurring bills, then proposes
          realistic monthly budgets. Manually-set limits are never overwritten.
        </p>
        <div className="flex flex-col gap-3">
          <AiConsole
            endpoint="/api/budget/recalibrate?preview=1"
            label="$ ai preview"
            pendingLabel="thinking…"
            refreshOnDone={false}
          />
          <AiConsole
            endpoint="/api/budget/recalibrate"
            label="$ ai recalibrate"
            pendingLabel="recalibrating…"
          />
        </div>
      </Panel>

      <Panel title="EDIT LIMITS">
        <BudgetEditor categories={rows} />
      </Panel>
    </main>
  );
}
