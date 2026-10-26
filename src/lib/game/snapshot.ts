import { db } from "@/db";
import { gameState } from "@/db/schema";
import { getStreak, type StreakInfo } from "./streak";
import { getPot, type PotInfo } from "./pot";
import { getAchievementXp, getUnlockedIds } from "./achievements";
import { getChallengeXp, getChallengesCompleted } from "./challenges";
import { computeXp, levelFromXp, type LevelInfo, type XpInputs } from "./level";
import { getInvestmentAccountsTotal } from "@/lib/investments";
import { getNextMilestone, type MilestoneInfo } from "./velocity";
import { getAllSalaryCycles } from "@/lib/period";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { XP_BUDGET_PER_100_KR } from "./level";

/** Live view of the last completed salary cycle, the one budget XP is judged on. */
export interface BudgetCheck {
  label: string;
  spent: number;
  budget: number;
  evaluated: boolean; // XP already awarded for this cycle
  xp: number; // what it earns (0 when over budget)
}

async function getBudgetCheck(lastBudgetPeriod: string | null): Promise<BudgetCheck | null> {
  const previous = (await getAllSalaryCycles())[1];
  if (!previous?.to) return null;
  const status = await getMonthlyBudgetStatus(new Date(previous.from + "T12:00:00Z"));
  const surplus = Math.max(0, status.totalBudget - status.totalSpent);
  return {
    label: status.label,
    spent: Math.round(status.totalSpent),
    budget: Math.round(status.totalBudget),
    evaluated: lastBudgetPeriod === previous.ym,
    xp: Math.floor(surplus / 100) * XP_BUDGET_PER_100_KR,
  };
}

export interface ReactorSnapshot {
  level: LevelInfo;
  streak: StreakInfo;
  pot: PotInfo;
  investmentsTotal: number;
  xpInputs: XpInputs;
  shields: number;
  directiveStreak: number;
  nextMilestone: MilestoneInfo | null;
  budgetCheck: BudgetCheck | null;
}

export async function getReactorSnapshot(): Promise<ReactorSnapshot> {
  const [
    streak, pot, investments,
    achievementXp, challengeXp, challengesCompleted,
    unlockedIds, gs,
  ] = await Promise.all([
    getStreak(), getPot(), getInvestmentAccountsTotal(),
    getAchievementXp(), getChallengeXp(), getChallengesCompleted(),
    getUnlockedIds(),
    db.select().from(gameState).limit(1),
  ]);

  const shields         = gs[0]?.shields         ?? 0;
  const directiveStreak = gs[0]?.directiveStreak ?? 0;
  const budgetXp        = gs[0]?.budgetXp        ?? 0;
  const budgetCheck     = await getBudgetCheck(gs[0]?.lastBudgetPeriod ?? null);

  const xpInputs: XpInputs = {
    investmentsTotal: investments,
    bestStreak:       streak.best,
    achievementXp,
    challengeXp,
    budgetXp,
  };

  const xp    = computeXp(xpInputs);
  const level = levelFromXp(xp, streak.breachToday && shields === 0);

  const nextMilestone = getNextMilestone(unlockedIds, {
    investmentsTotal:    investments,
    bestStreak:          streak.best,
    currentStreak:       streak.current,
    tierIndex:           level.index,
    challengesCompleted,
    potCharge:           pot.charge,
    investmentSpike:     false,
    directiveStreak,
    budgetXp,
    xp,
  });

  return {
    level, streak, pot,
    investmentsTotal: investments,
    xpInputs, shields, directiveStreak, nextMilestone, budgetCheck,
  };
}
