import { getStreak, type StreakInfo } from "./streak";
import { getPot, type PotInfo } from "./pot";
import { getAchievementXp } from "./achievements";
import { getChallengeXp } from "./challenges";
import { computeXp, levelFromXp, type LevelInfo, type XpInputs } from "./level";
import { getSavingsTotal } from "@/lib/savings";
import { getInvestmentsTotal } from "./history";

export interface ReactorSnapshot {
  level: LevelInfo;
  streak: StreakInfo;
  pot: PotInfo;
  savingsTotal: number;
  investmentsTotal: number;
  xpInputs: XpInputs; // exposed so XpBreakdown can render the math
}

export async function getReactorSnapshot(): Promise<ReactorSnapshot> {
  const [streak, pot, savings, investments, achievementXp, challengeXp] = await Promise.all([
    getStreak(),
    getPot(),
    getSavingsTotal(),
    getInvestmentsTotal(),
    getAchievementXp(),
    getChallengeXp(),
  ]);

  const xpInputs: XpInputs = {
    savingsTotal: savings.total,
    investmentsTotal: investments,
    bestStreak: streak.best,
    achievementXp,
    challengeXp,
  };

  return {
    level: levelFromXp(computeXp(xpInputs), streak.breachToday),
    streak,
    pot,
    savingsTotal: savings.total,
    investmentsTotal: investments,
    xpInputs,
  };
}
