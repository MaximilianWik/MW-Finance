import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getAllSalaryCycles } from "@/lib/period";
import { XP_BUDGET_PER_100_KR } from "./level";

export interface BudgetDisciplineResult {
  bonusXp: number;
  surplusKr: number;
  period: string;   // YYYY-MM of the evaluated cycle
}

/**
 * Compute XP earned for a completed salary cycle that ended under budget.
 * Returns null when nothing should be awarded (no completed cycle, already
 * evaluated, or the cycle ran over budget).
 *
 * @param lastEvaluatedPeriod - the YYYY-MM stored in game_state.last_budget_period
 */
export async function evaluateBudgetDiscipline(
  lastEvaluatedPeriod: string | null
): Promise<BudgetDisciplineResult | null> {
  const cycles = await getAllSalaryCycles();
  // cycles[0] = current (possibly open) cycle, cycles[1] = most-recently-completed
  const current  = cycles[0];
  const previous = cycles[1];

  if (!current || !previous) return null;

  // Only run once per cycle transition.
  if (current.ym === lastEvaluatedPeriod) return null;

  // Evaluate the COMPLETED previous cycle (must have a defined end date).
  if (!previous.to) return null;

  const ref = new Date(previous.from + "T12:00:00Z");
  const status = await getMonthlyBudgetStatus(ref);

  // Skip if the cycle is still open or has no budget set.
  if (!status.to || status.totalBudget <= 0) return null;

  const surplusKr = Math.max(0, status.totalBudget - status.totalSpent);
  if (surplusKr <= 0) return null;

  const bonusXp = Math.floor(surplusKr / 100) * XP_BUDGET_PER_100_KR;
  return { bonusXp, surplusKr, period: previous.ym };
}
