import { db } from "@/db";
import { challenges, transactions, categories } from "@/db/schema";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { Challenge } from "@/db/schema";
import {
  getDailyPace,
  getDailySpendMap,
  todayIso,
  shiftIso,
  daysBetween,
  weekStartOf,
  isoWeek,
} from "./pace";

// Live metrics a template measures its progress against.
interface Metrics {
  cleanDays: number;
  noSpendDays: number;
  restaurantSpend: number;
  investmentSpend: number;
  savingsSpend: number;
  pace: number;
}

interface ChallengeTemplate {
  key: string;
  title: string;
  description: string;
  target: number;
  rewardXp: number;
  lowerIsBetter: boolean;
  measure: (m: Metrics) => number;
}

// The weekly slate. uniqueIndex(week, template_key) makes generation idempotent.
export const TEMPLATES: ChallengeTemplate[] = [
  {
    key: "clean_5",
    title: "Hold Containment",
    description: "Keep 5 days this week at or under daily pace.",
    target: 5,
    rewardXp: 300,
    lowerIsBetter: false,
    measure: (m) => m.cleanDays,
  },
  {
    key: "no_spend_3",
    title: "Dark Reactor",
    description: "3 zero-spend days this week.",
    target: 3,
    rewardXp: 250,
    lowerIsBetter: false,
    measure: (m) => m.noSpendDays,
  },
  {
    key: "cook_home",
    title: "Cold Kitchen",
    description: "Keep restaurant spend under 300 kr this week.",
    target: 300,
    rewardXp: 350,
    lowerIsBetter: true,
    measure: (m) => m.restaurantSpend,
  },
  {
    key: "invest_capital",
    title: "Deploy Capital",
    description: "Make at least one investment transfer this week.",
    target: 1,
    rewardXp: 400,
    lowerIsBetter: false,
    measure: (m) => m.investmentSpend > 0 ? 1 : 0,
  },
  {
    key: "fuel_reserve",
    title: "Fuel the Reserve",
    description: "Make at least one savings transfer this week.",
    target: 1,
    rewardXp: 400,
    lowerIsBetter: false,
    measure: (m) => m.savingsSpend > 0 ? 1 : 0,
  },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

/** Compute this week's live metrics (Mon→today). */
async function weekMetrics(weekStart: string, today: string, pace: number): Promise<Metrics> {
  const spend = await getDailySpendMap(weekStart, today);
  const days = daysBetween(weekStart, today);
  const eps = 0.5;
  let cleanDays = 0;
  let noSpendDays = 0;
  for (let i = 0; i < days; i++) {
    const s = spend.get(shiftIso(weekStart, i)) ?? 0;
    if (s <= pace + eps) cleanDays++;
    if (s <= eps) noSpendDays++;
  }

  const spendExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;
  const catQuery = (catName: string) =>
    db
      .select({ total: spendExpr })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(categories.name, catName),
          gte(transactions.bookingDate, weekStart),
          lte(transactions.bookingDate, today)
        )
      );

  const [[rest], [invest], [save]] = await Promise.all([
    catQuery("Restaurants"),
    catQuery("Investments"),
    catQuery("Savings"),
  ]);

  return {
    cleanDays,
    noSpendDays,
    restaurantSpend:  rest?.total    ?? 0,
    investmentSpend:  invest?.total  ?? 0,
    savingsSpend:     save?.total    ?? 0,
    pace,
  };
}

/** Ensure the current week's challenges exist. Idempotent. */
async function generateForWeek(week: string): Promise<void> {
  await db
    .insert(challenges)
    .values(
      TEMPLATES.map((t) => ({
        week,
        templateKey: t.key,
        title: t.title,
        description: t.description,
        target: String(t.target),
        rewardXp: t.rewardXp,
        lowerIsBetter: t.lowerIsBetter,
      }))
    )
    .onConflictDoNothing();
}

/** Resolve a stale (past-week) active challenge from its stored progress. */
function finalStatus(c: Challenge): "complete" | "failed" {
  const progress = Number(c.progress);
  const target = Number(c.target);
  const ok = c.lowerIsBetter ? progress <= target : progress >= target;
  return ok ? "complete" : "failed";
}

export interface ChallengeEvalResult {
  completed: Challenge[]; // newly completed this run (for notifications)
}

/**
 * Nightly challenge eval:
 *   1. finalize any active challenges from prior weeks (by stored progress)
 *   2. generate this week's slate
 *   3. update live progress; count-up challenges complete on reaching target,
 *      stay-under challenges fail early once the cap is breached.
 */
export async function evaluateChallenges(): Promise<ChallengeEvalResult> {
  const today = todayIso();
  const week = isoWeek(today);
  const weekStart = weekStartOf(today);
  const completed: Challenge[] = [];

  // 1. Finalize prior-week actives.
  const stale = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.status, "active"), ne(challenges.week, week)));
  for (const c of stale) {
    const status = finalStatus(c);
    await db
      .update(challenges)
      .set({ status, completedAt: status === "complete" ? new Date() : null })
      .where(eq(challenges.id, c.id));
    if (status === "complete") completed.push({ ...c, status });
  }

  // 2. Generate this week.
  await generateForWeek(week);

  // 3. Update live progress on this week's actives.
  const { pace } = await getDailyPace();
  const metrics = await weekMetrics(weekStart, today, pace);

  const active = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.status, "active"), eq(challenges.week, week)));

  for (const c of active) {
    const tpl = BY_KEY.get(c.templateKey);
    if (!tpl) continue;
    const progress = tpl.measure(metrics);
    const target = Number(c.target);

    let status: string = "active";
    let completedAt: Date | null = null;
    if (!c.lowerIsBetter && progress >= target) {
      status = "complete";
      completedAt = new Date();
    } else if (c.lowerIsBetter && progress > target) {
      status = "failed"; // cap breached; cannot recover this week
    }

    await db
      .update(challenges)
      .set({ progress: String(progress), status, completedAt })
      .where(eq(challenges.id, c.id));

    if (status === "complete") completed.push({ ...c, progress: String(progress), status, completedAt });
  }

  return { completed };
}

/** Count of all-time completed challenges. */
export async function getChallengesCompleted(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(challenges)
    .where(eq(challenges.status, "complete"));
  return row?.n ?? 0;
}

/** Total XP from completed challenges. */
export async function getChallengeXp(): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${challenges.rewardXp}), 0)::int` })
    .from(challenges)
    .where(eq(challenges.status, "complete"));
  return row?.xp ?? 0;
}

/** This week's challenges for the /rank UI (live). */
export async function getActiveChallenges(): Promise<Challenge[]> {
  const week = isoWeek(todayIso());
  return db
    .select()
    .from(challenges)
    .where(eq(challenges.week, week))
    .orderBy(challenges.id);
}
