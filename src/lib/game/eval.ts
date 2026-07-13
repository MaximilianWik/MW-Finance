import { getStreak, persistStreak } from "./streak";
import { getPot } from "./pot";
import { evaluateChallenges, getChallengeXp, getChallengesCompleted } from "./challenges";
import { evaluateAchievements, getAchievementXp } from "./achievements";
import { computeXp, levelFromXp } from "./level";
import { getSavingsTotal } from "@/lib/savings";
import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";

export interface GameEvalResult {
  currentStreak: number;
  bestStreak: number;
  breach: boolean;
  challengesCompleted: number;
  achievementsUnlocked: string[];
  tier: string;
}

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);

/**
 * Nightly reactor eval. Recomputes the streak, resolves weekly challenges, then
 * unlocks any newly-earned achievements. Pushes loss-framed ntfy alerts for
 * breaches, milestones, unlocks and completed directives. Idempotent.
 */
export async function runGameEval(onLog?: (line: string) => void): Promise<GameEvalResult> {
  const log = (l: string) => onLog?.(l);

  // 1. Streak + high-water mark.
  const streak = await getStreak();
  const { newBest, best } = await persistStreak(streak.current);
  log(`[streak] current=${streak.current}d best=${best}d${streak.breachToday ? " BREACH" : ""}`);

  // 2. Weekly challenges.
  const { completed } = await evaluateChallenges();
  for (const c of completed) {
    log(`[challenge] complete: ${c.title} (+${c.rewardXp} XP)`);
    await sendNtfy(`Directive complete: ${c.title} (+${c.rewardXp} XP)`, {
      title: "Reactor · challenge cleared",
      tags: ["white_check_mark"],
      priority: 3,
      click: env.appUrl + "/rank",
    });
  }

  // 3. Achievement context (tier needs a provisional XP incl. current unlocks).
  const [savings, achievementXp, challengeXp, challengesCompleted] = await Promise.all([
    getSavingsTotal(),
    getAchievementXp(),
    getChallengeXp(),
    getChallengesCompleted(),
  ]);
  const xp = computeXp({ savingsTotal: savings.total, bestStreak: best, achievementXp, challengeXp });
  const level = levelFromXp(xp, streak.breachToday);

  const unlocked = await evaluateAchievements({
    savingsTotal: savings.total,
    bestStreak: best,
    currentStreak: streak.current,
    tierIndex: level.index,
    challengesCompleted,
    potCharge: (await getPot()).charge,
  });
  for (const a of unlocked) {
    log(`[achievement] unlocked: ${a.name} (+${a.xp} XP)`);
    await sendNtfy(`Achievement unlocked: ${a.name}: ${a.description}`, {
      title: "Reactor · achievement",
      tags: ["trophy"],
      priority: 3,
      click: env.appUrl + "/rank",
    });
  }

  // 4. Breach + milestone alerts.
  if (streak.breachToday) {
    await sendNtfy(
      `[!] CONTAINMENT BREACH. Today's spend broke pace (${Math.round(streak.pace)} kr/day). Uptime reset.`,
      { title: "Reactor · breach", tags: ["rotating_light"], priority: 4, click: env.appUrl }
    );
  } else if (newBest && STREAK_MILESTONES.has(best)) {
    await sendNtfy(`Reactor uptime ${best} days. New record. Containment stable.`, {
      title: "Reactor · milestone",
      tags: ["fire"],
      priority: 3,
      click: env.appUrl,
    });
  }

  return {
    currentStreak: streak.current,
    bestStreak: best,
    breach: streak.breachToday,
    challengesCompleted,
    achievementsUnlocked: unlocked.map((a) => a.id),
    tier: level.tier.name,
  };
}
