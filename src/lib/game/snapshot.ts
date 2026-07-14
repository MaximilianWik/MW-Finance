import { db } from "@/db";
import { gameState } from "@/db/schema";
import { getStreak, type StreakInfo } from "./streak";
import { getPot, type PotInfo } from "./pot";
import { getAchievementXp, getUnlockedIds } from "./achievements";
import { getChallengeXp, getChallengesCompleted } from "./challenges";
import { computeXp, levelFromXp, type LevelInfo, type XpInputs } from "./level";
import { getSavingsTotal } from "@/lib/savings";
import { getInvestmentsTotal } from "./history";
import { getNextMilestone, type MilestoneInfo } from "./velocity";

export interface ReactorSnapshot {
  level: LevelInfo;
  streak: StreakInfo;
  pot: PotInfo;
  savingsTotal: number;
  investmentsTotal: number;
  xpInputs: XpInputs;
  shields: number;
  directiveStreak: number;
  nextMilestone: MilestoneInfo | null;
}

export async function getReactorSnapshot(): Promise<ReactorSnapshot> {
  const [
    streak, pot, savings, investments,
    achievementXp, challengeXp, challengesCompleted,
    unlockedIds, gs,
  ] = await Promise.all([
    getStreak(), getPot(), getSavingsTotal(), getInvestmentsTotal(),
    getAchievementXp(), getChallengeXp(), getChallengesCompleted(),
    getUnlockedIds(),
    db.select().from(gameState).limit(1),
  ]);

  const shields         = gs[0]?.shields         ?? 0;
  const directiveStreak = gs[0]?.directiveStreak ?? 0;

  const xpInputs: XpInputs = {
    savingsTotal:     savings.total,
    investmentsTotal: investments,
    bestStreak:       streak.best,
    achievementXp,
    challengeXp,
  };

  const xp    = computeXp(xpInputs);
  const level = levelFromXp(xp, streak.breachToday && shields === 0);

  const nextMilestone = getNextMilestone(unlockedIds, {
    savingsTotal:        savings.total,
    investmentsTotal:    investments,
    bestStreak:          streak.best,
    currentStreak:       streak.current,
    tierIndex:           level.index,
    challengesCompleted,
    potCharge:           pot.charge,
    savingsSpike:        false,
    directiveStreak,
    xp,
  });

  return {
    level, streak, pot,
    savingsTotal: savings.total, investmentsTotal: investments,
    xpInputs, shields, directiveStreak, nextMilestone,
  };
}
