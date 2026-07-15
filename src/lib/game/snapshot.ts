import { db } from "@/db";
import { gameState } from "@/db/schema";
import { getStreak, type StreakInfo } from "./streak";
import { getPot, type PotInfo } from "./pot";
import { getAchievementXp, getUnlockedIds } from "./achievements";
import { getChallengeXp, getChallengesCompleted } from "./challenges";
import { computeXp, levelFromXp, type LevelInfo, type XpInputs } from "./level";
import { getInvestmentAccountsTotal } from "@/lib/investments";
import { getNextMilestone, type MilestoneInfo } from "./velocity";

export interface ReactorSnapshot {
  level: LevelInfo;
  streak: StreakInfo;
  pot: PotInfo;
  investmentsTotal: number;
  xpInputs: XpInputs;
  shields: number;
  directiveStreak: number;
  nextMilestone: MilestoneInfo | null;
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
    xpInputs, shields, directiveStreak, nextMilestone,
  };
}
