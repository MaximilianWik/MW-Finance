import { getStreak, type StreakInfo } from "./streak";
import { getPot, type PotInfo } from "./pot";
import { getAchievementXp } from "./achievements";
import { getChallengeXp } from "./challenges";
import { computeXp, levelFromXp, type LevelInfo } from "./level";
import { getSavingsTotal } from "@/lib/savings";

export interface ReactorSnapshot {
  level: LevelInfo;
  streak: StreakInfo;
  pot: PotInfo;
  savingsTotal: number;
}

/**
 * Read-only reactor state for the overview + /rank pages. XP is derived here
 * from savings + streak + unlocked achievements + completed challenges; the
 * core is flagged `danger` whenever today has breached containment.
 */
export async function getReactorSnapshot(): Promise<ReactorSnapshot> {
  const [streak, pot, savings, achievementXp, challengeXp] = await Promise.all([
    getStreak(),
    getPot(),
    getSavingsTotal(),
    getAchievementXp(),
    getChallengeXp(),
  ]);

  const xp = computeXp({
    savingsTotal: savings.total,
    bestStreak: streak.best,
    achievementXp,
    challengeXp,
  });

  return {
    level: levelFromXp(xp, streak.breachToday),
    streak,
    pot,
    savingsTotal: savings.total,
  };
}
