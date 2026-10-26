import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getAllSalaryCycles } from "@/lib/period";
import { BudgetBar, type BudgetLock } from "../ui/BudgetBar";
import { NewCategoryForm } from "../ui/NewCategoryForm";
import { BudgetCycleNav } from "../ui/BudgetCycleNav";
import { Panel } from "../ui/Panel";
import { RecalibratePanel } from "../ui/RecalibratePanel";
import { QueryLog } from "../ui/QueryLog";
import { BILLS_CATEGORY, BUFFER_CATEGORY, NOT_BUDGETED, isLocked, syncBudgetLocks } from "@/lib/budget-rules";
import { kr } from "@/lib/format";
import { withQueryLog } from "@/db/query-log";

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

  const t0 = Date.now();
  const [[status, cycles, plan], queryLog] = await withQueryLog(async () => {
    // Bills = checklist total, Buffer = unassigned income; both before we read.
    const { plan } = await syncBudgetLocks();
    return Promise.all([getMonthlyBudgetStatus(ref), getAllSalaryCycles(), plan]);
  });
  const tookMs = Date.now() - t0;

  const lockOf = (name: string): BudgetLock =>
    name === BILLS_CATEGORY ? "bills" : name === BUFFER_CATEGORY ? "buffer" : isLocked(name) ? "fixed" : null;

  // Budgeted categories first (has a monthly budget set), then by existing sort order.
  const monthlyRows = status.rows
    .filter((r) => !NOT_BUDGETED.has(r.name)) // Income and Transfers aren't spending
    .sort((a, b) => {
      const aB = a.budget != null ? 1 : 0;
      const bB = b.budget != null ? 1 : 0;
      return bB - aB; // stable within each group (JS sort is stable)
    });
  const todayIso = new Date().toISOString().slice(0, 10);
  const mr = { from: status.from || todayIso, to: status.to ?? todayIso };

  // The "current" from for the nav: if a past cycle is selected use its from;
  // otherwise use the first (latest) detected cycle's from so the selector
  // shows the right option as selected.
  const displayFrom = cycleFrom ?? cycles[0]?.from ?? "";

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="BUDGETS" />

      <Panel title="AI BUDGET">
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          The engine sets each budget from the median of your last finished salary cycles, so one
          heavy month barely counts, and one-off big purchases are left out. A budget moves at
          most ±20% per run. Manually-set limits are never overwritten, savings are never touched,
          and bills follow the bills checklist. Written guidance lifts the ±20% limit. Budgeting is
          zero-based: whatever income no category is assigned sits in Buffer, which absorbs
          overspending first and is swept to savings at cycle end.
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
        {isCurrentCycle && plan.incomeSource !== "none" && (
          <p className={`mb-3 text-[0.65rem] uppercase tracking-term ${plan.overBy > 0 ? "text-danger" : "text-faint"}`}>
            income {kr(plan.income)}
            {plan.incomeSource === "median" ? " (expected)" : ""} · assigned {kr(plan.assigned)} ·{" "}
            {plan.overBy > 0 ? (
              <>over-assigned by {kr(plan.overBy)}: lower a limit</>
            ) : (
              <>buffer {kr(plan.buffer)}</>
            )}
          </p>
        )}
        {!isCurrentCycle && (
          <p className="mb-2 text-[0.65rem] text-faint">
            [ HISTORICAL ] budgets shown are your current limits applied to that period&apos;s spending.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {monthlyRows.map((r) => (
                <BudgetBar
                  key={r.categoryId}
                  row={r}
                  range={{ from: mr.from, to: mr.to }}
                  editable={isCurrentCycle}
                  lock={lockOf(r.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {isCurrentCycle && (
          <p className="mt-2 text-[0.6rem] uppercase tracking-term text-faint">
            click a limit to edit · enter saves · esc cancels · empty = no budget · open a row for colour / delete
          </p>
        )}
        {isCurrentCycle && <NewCategoryForm />}
      </Panel>
    </main>
  );
}
