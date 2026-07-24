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
 * Returns null when nothing should be awarded:
 *   - fewer than 2 salary cycles in history (previous cycle unknown)
 *   - previous cycle already evaluated this run (guard by previous.ym)
 *   - previous cycle has no closing date
 *   - no category budgets set (totalBudget = 0)
 *   - cycle ran over or exactly at budget (surplusKr <= 0)
 *   - surplus too small to earn even 1 XP (< 100 kr)
 *
 * @param lastEvaluatedPeriod - the YYYY-MM stored in game_state.last_budget_period
 * @param onLog               - optional log sink (eval output stream)
 */
export async function evaluateBudgetDiscipline(
  lastEvaluatedPeriod: string | null,
  onLog?: (line: string) => void,
): Promise<BudgetDisciplineResult | null> {
  const log = (s: string) => onLog?.(s);
  const cycles = await getAllSalaryCycles();
  // cycles[0] = current (possibly open) cycle, cycles[1] = most-recently-completed
  const current  = cycles[0];
  const previous = cycles[1];

  if (!current || !previous) {
    log("[BUDGET] Fewer than 2 salary cycles found — no completed cycle to evaluate.");
    return null;
  }

  // Guard: skip if this completed cycle was already evaluated.
  // Store and compare by previous.ym, not current.ym.
  if (previous.ym === lastEvaluatedPeriod) {
    log(`[BUDGET] Cycle ${previous.ym} already evaluated — skipping.`);
    return null;
  }

  // The previous cycle must be closed (has a defined end date).
  if (!previous.to) {
    log("[BUDGET] Previous cycle has no end date — skipping.");
    return null;
  }

  const ref = new Date(previous.from + "T12:00:00Z");
  const status = await getMonthlyBudgetStatus(ref);

  if (!status.to) {
    log("[BUDGET] Budget status returned an open cycle — skipping.");
    return null;
  }
  if (status.totalBudget <= 0) {
    log("[BUDGET] No category budgets set (totalBudget = 0) — set budgets on /budgets to earn budget XP.");
    return null;
  }

  const surplusKr = Math.max(0, status.totalBudget - status.totalSpent);
  if (surplusKr <= 0) {
    log(`[BUDGET] Cycle ${previous.ym}: over budget by ${Math.round(status.totalSpent - status.totalBudget).toLocaleString("sv-SE")} kr — no XP.`);
    return null;
  }

  const bonusXp = Math.floor(surplusKr / 100) * XP_BUDGET_PER_100_KR;
  if (bonusXp <= 0) {
    log(`[BUDGET] Cycle ${previous.ym}: surplus ${Math.round(surplusKr).toLocaleString("sv-SE")} kr — under 100 kr threshold, no XP.`);
    return null;
  }

  return { bonusXp, surplusKr, period: previous.ym };
}
