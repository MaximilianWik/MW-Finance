import { db } from "@/db";
import { gameState, transactions, categories } from "@/db/schema";
import { getStreak, getStreakAsOf } from "./streak";
import { getPot } from "./pot";
import { evaluateChallenges, getChallengeXp, getChallengesCompleted } from "./challenges";
import { evaluateAchievements, getAchievementXp } from "./achievements";
import { computeXp, levelFromXp } from "./level";
import { evaluateBudgetDiscipline } from "./budget-xp";
import { getInvestmentAccountsTotal } from "@/lib/investments";
import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";
import { todayIso, shiftIso, isoWeek } from "./pace";
import { and, eq, sql } from "drizzle-orm";

export interface GameEvalResult {
  currentStreak: number;
  bestStreak: number;
  shields: number;
  breach: boolean;
  shielded: boolean;
  directiveStreak: number;
  challengesCompleted: number;
  achievementsUnlocked: string[];
  tier: string;
}

const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100]);
const MAX_SHIELDS = 3;
const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

async function detectInvestmentSpike(): Promise<boolean> {
  // Compare this month's new investments to the 3-month rolling avg.
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const outflowExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const monthOf = (offset: number) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
  };
  const pastMonths = [monthOf(-1), monthOf(-2), monthOf(-3)];

  const [currRow] = await db
    .select({ total: outflowExpr })
    .from(transactions).innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(sql`to_char(${transactions.bookingDate},'YYYY-MM') = ${thisMonth}`, eq(categories.name, "Investments")));

  const pastRows = await db
    .select({ total: outflowExpr, month: sql<string>`to_char(${transactions.bookingDate},'YYYY-MM')` })
    .from(transactions).innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(sql`to_char(${transactions.bookingDate},'YYYY-MM') IN (${pastMonths[0]}, ${pastMonths[1]}, ${pastMonths[2]})`, eq(categories.name, "Investments")))
    .groupBy(sql`to_char(${transactions.bookingDate},'YYYY-MM')`);

  const curr = currRow?.total ?? 0;
  const avg = pastRows.reduce((s, r) => s + r.total, 0) / 3;
  return avg > 0 && curr >= avg * 2;
}

/**
 * Nightly reactor eval. Processes in order:
 *   1. Read stored game state
 *   2. Compute raw streak; absorb breach with a shield if available
 *   3. Award shields for newly completed 7-day blocks
 *   4. Resolve weekly challenges + directive streak
 *   5. Detect savings spike
 *   6. Evaluate achievements
 *   7. Write updated game state in one shot
 *   8. ntfy notifications
 */
export async function runGameEval(onLog?: (line: string) => void): Promise<GameEvalResult> {
  const log = (l: string) => onLog?.(l);
  log("[EXEC] reactor eval initiated...");

  // 1. Load stored state.
  const [gs] = await db.select().from(gameState).limit(1);
  let shields           = gs?.shields           ?? 0;
  let directiveStreak   = gs?.directiveStreak   ?? 0;
  let lastDirectiveWeek = gs?.lastDirectiveWeek ?? null;
  let budgetXp          = gs?.budgetXp          ?? 0;
  let lastBudgetPeriod  = gs?.lastBudgetPeriod  ?? null;
  const storedBest      = gs?.bestStreak        ?? 0;

  // 2. Raw streak.
  const streak = await getStreak();
  const today  = todayIso();
  const currentWeek = isoWeek(today);

  let effectiveStreak = streak.current;
  let shielded = false;

  if (streak.breachToday) {
    if (shields > 0) {
      shields--;
      shielded = true;
      const yesterday = shiftIso(today, -1);
      const prevStreak = await getStreakAsOf(yesterday);
      effectiveStreak = prevStreak + 1;
      log(`[!] BREACH DETECTED: ${kr(streak.todaySpend)} vs pace ${kr(streak.pace)}`);
      log(`[SHIELD] CONTAINMENT ABSORBED. Shield consumed. ${shields} shield(s) remaining.`);
      log(`[CORE] Uptime maintained at ${effectiveStreak}d via shield.`);
    } else {
      effectiveStreak = 0;
      log(`[!] CONTAINMENT BREACH: ${kr(streak.todaySpend)} vs pace ${kr(streak.pace)}`);
      log(`[CORE] UPTIME RESET. No shields remaining. Streak: 0d.`);
    }
  } else {
    log(`[OK] Containment stable. Uptime: ${effectiveStreak}d.`);
  }

  // 3. Update best + award shields for newly completed 7-day blocks.
  const newBest = Math.max(storedBest, effectiveStreak);
  const prevBlocks = Math.floor(storedBest / 7);
  const newBlocks  = Math.floor(newBest  / 7);
  if (newBlocks > prevBlocks) {
    const toAward = Math.min(MAX_SHIELDS, newBlocks - prevBlocks);
    const hadShields = shields;
    shields = Math.min(MAX_SHIELDS, shields + toAward);
    const awarded = shields - hadShields;
    if (awarded > 0) {
      log(`[SHIELD] ${awarded} shield(s) awarded for ${newBest}d uptime. Total: ${shields}/${MAX_SHIELDS}.`);
      await sendNtfy(`Reactor shield charged (${shields}/${MAX_SHIELDS}). ${newBest}-day uptime milestone.`, {
        title: "Reactor · shield", tags: ["shield"], priority: 3, click: env.appUrl,
      });
    }
  }
  if (newBest > storedBest) {
    log(`[STREAK] New best: ${newBest}d.`);
  }

  // 4. Weekly challenges + directive streak.
  const pot = await getPot();
  const { completed } = await evaluateChallenges();
  for (const c of completed) {
    log(`[DIRECTIVE] Cleared: ${c.title} (+${c.rewardXp} XP)`);
    await sendNtfy(`Directive cleared: ${c.title} (+${c.rewardXp} XP)`, {
      title: "Reactor · directive", tags: ["white_check_mark"], priority: 3, click: env.appUrl + "/rank",
    });
  }

  const anyCompletedThisWeek = completed.some((c) => c.week === currentWeek);

  if (currentWeek !== lastDirectiveWeek) {
    if (anyCompletedThisWeek) {
      directiveStreak++;
      lastDirectiveWeek = currentWeek;
      log(`[DIRECTIVE] Streak: ${directiveStreak} consecutive week(s).`);
    } else if (lastDirectiveWeek && currentWeek > lastDirectiveWeek) {
      directiveStreak = 0;
      log(`[DIRECTIVE] Streak broken (no directive cleared last week). Reset: 0.`);
    }
  }

  // 5. Investment spike detection + budget discipline.
  const [investments, achievementXp, challengeXp, challengesCompleted] = await Promise.all([
    getInvestmentAccountsTotal(), getAchievementXp(), getChallengeXp(), getChallengesCompleted(),
  ]);
  const spike = await detectInvestmentSpike();
  if (spike) log(`[SURGE] Investment spike detected this month.`);

  // Budget discipline: award XP when a salary cycle closes under total budget.
  const budgetResult = await evaluateBudgetDiscipline(lastBudgetPeriod);
  if (budgetResult) {
    budgetXp += budgetResult.bonusXp;
    lastBudgetPeriod = budgetResult.period;
    log(`[BUDGET] Cycle ${budgetResult.period} ended ${Math.round(budgetResult.surplusKr).toLocaleString("sv-SE")} kr under budget. +${budgetResult.bonusXp} XP.`);
    if (budgetResult.bonusXp > 0) {
      await sendNtfy(
        `Budget discipline: ${Math.round(budgetResult.surplusKr).toLocaleString("sv-SE")} kr under budget this cycle. +${budgetResult.bonusXp} XP.`,
        { title: "Reactor · budget", tags: ["chart_with_upwards_trend"], priority: 3, click: env.appUrl + "/rank" }
      );
    }
  }

  // 6. Achievements.
  const xp = computeXp({
    investmentsTotal: investments,
    bestStreak: newBest, achievementXp, challengeXp, budgetXp,
  });
  const level = levelFromXp(xp, streak.breachToday && !shielded);

  const unlocked = await evaluateAchievements({
    investmentsTotal: investments,
    bestStreak: newBest, currentStreak: effectiveStreak,
    tierIndex: level.index, challengesCompleted, potCharge: pot.charge,
    investmentSpike: spike, directiveStreak, budgetXp,
  });
  for (const a of unlocked) {
    log(`[ACHIEVEMENT] Unlocked: ${a.name} (+${a.xp} XP)`);
    await sendNtfy(`Achievement unlocked: ${a.name}: ${a.description}`, {
      title: "Reactor · achievement", tags: ["trophy"], priority: 3, click: env.appUrl + "/rank",
    });
  }

  // 7. Write game state.
  await db.insert(gameState)
    .values({ key: "singleton", bestStreak: newBest, shields, directiveStreak, lastDirectiveWeek, budgetXp, lastBudgetPeriod, lastEvalDate: sql`current_date`, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameState.key,
      set: { bestStreak: newBest, shields, directiveStreak, lastDirectiveWeek, budgetXp, lastBudgetPeriod, lastEvalDate: sql`current_date`, updatedAt: new Date() },
    });

  // 8. Breach + milestone ntfy.
  if (streak.breachToday && !shielded) {
    await sendNtfy(`[!] CONTAINMENT BREACH. ${kr(streak.todaySpend)} vs pace ${kr(streak.pace)}. Uptime reset.`, {
      title: "Reactor · breach", tags: ["rotating_light"], priority: 4, click: env.appUrl,
    });
  } else if (newBest > storedBest && STREAK_MILESTONES.has(newBest)) {
    await sendNtfy(`Reactor uptime ${newBest} days. New record. Containment stable.`, {
      title: "Reactor · milestone", tags: ["fire"], priority: 3, click: env.appUrl,
    });
  }

  log(`[DONE] Tier: ${level.tier.name} | ${xp.toLocaleString("sv-SE")} XP | Shields: ${shields}/${MAX_SHIELDS}`);

  return {
    currentStreak: effectiveStreak, bestStreak: newBest, shields,
    breach: streak.breachToday && !shielded ? false : streak.breachToday,
    shielded, directiveStreak, challengesCompleted,
    achievementsUnlocked: unlocked.map((a) => a.id), tier: level.tier.name,
  };
}
