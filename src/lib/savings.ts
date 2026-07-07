import { db } from "@/db";
import {
  savingsGoals,
  savingsContributions,
  settings,
  syncRuns,
  categories,
  transactions,
  budgetAdjustments,
} from "@/db/schema";
import { and, desc, eq, inArray, sql, gte, lte } from "drizzle-orm";
import { sendNtfy } from "@/lib/notify";
import { kr } from "@/lib/format";
import { env } from "@/lib/env";

/** Formatted YYYY-MM for a given date. */
function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export interface GoalSummary {
  id: number;
  name: string;
  target: number;
  current: number;
  currency: string;
  imageUrl: string | null;
  isPrimary: boolean;
  paused: boolean;
  targetDate: string | null;
  velocity: number; // average kr/month, last 3 months
  monthsToGoal: number | null; // null when velocity ≤ 0
  progressPct: number;
}

/** Load goals with computed velocity + months-to-goal. */
export async function getGoals(): Promise<GoalSummary[]> {
  const goals = await db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      target: sql<number>`${savingsGoals.targetAmount}::float`,
      current: sql<number>`${savingsGoals.currentAmount}::float`,
      currency: savingsGoals.currency,
      imageUrl: savingsGoals.imageUrl,
      isPrimary: savingsGoals.isPrimary,
      paused: savingsGoals.paused,
      targetDate: savingsGoals.targetDate,
    })
    .from(savingsGoals)
    .orderBy(desc(savingsGoals.isPrimary), savingsGoals.createdAt);

  if (goals.length === 0) return [];

  // Velocity = avg of last 3 months' contributions per goal.
  const now = new Date();
  const months = [monthOf(now), prevMonth(monthOf(now)), prevMonth(prevMonth(monthOf(now)))];

  const contribs = await db
    .select({
      goalId: savingsContributions.goalId,
      month: savingsContributions.month,
      total: sql<number>`sum(${savingsContributions.amount}::float)::float`,
    })
    .from(savingsContributions)
    .where(inArray(savingsContributions.month, months))
    .groupBy(savingsContributions.goalId, savingsContributions.month);

  const byGoal = new Map<number, number[]>();
  for (const c of contribs) {
    if (c.month == null) continue;
    const arr = byGoal.get(c.goalId) ?? [];
    arr.push(c.total);
    byGoal.set(c.goalId, arr);
  }

  return goals.map((g) => {
    const totals = byGoal.get(g.id) ?? [];
    const velocity =
      totals.length > 0 ? totals.reduce((s, n) => s + n, 0) / 3 : 0;
    const remaining = Math.max(0, g.target - g.current);
    const monthsToGoal = velocity > 0 ? remaining / velocity : null;
    const progressPct = g.target > 0 ? Math.min(1, g.current / g.target) : 0;
    return {
      id: g.id,
      name: g.name,
      target: g.target,
      current: g.current,
      currency: g.currency,
      imageUrl: g.imageUrl,
      isPrimary: g.isPrimary,
      paused: g.paused,
      targetDate: g.targetDate,
      velocity,
      monthsToGoal,
      progressPct,
    };
  });
}

export async function getGoal(id: number) {
  const [row] = await db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.id, id))
    .limit(1);
  return row ?? null;
}

export async function getGoalContributions(goalId: number) {
  return db
    .select({
      id: savingsContributions.id,
      amount: sql<number>`${savingsContributions.amount}::float`,
      source: savingsContributions.source,
      month: savingsContributions.month,
      note: savingsContributions.note,
      createdAt: savingsContributions.createdAt,
    })
    .from(savingsContributions)
    .where(eq(savingsContributions.goalId, goalId))
    .orderBy(desc(savingsContributions.createdAt));
}

/** Add a contribution and bump the goal's current_amount atomically. */
export async function addContribution(params: {
  goalId: number;
  amount: number;
  source?: "manual" | "sweep";
  month?: string;
  note?: string;
}) {
  const { goalId, amount, source = "manual", month, note } = params;
  if (amount <= 0) throw new Error("amount must be > 0");
  await db.insert(savingsContributions).values({
    goalId,
    amount: amount.toFixed(2),
    source,
    month: month ?? monthOf(new Date()),
    note,
  });
  await db
    .update(savingsGoals)
    .set({
      currentAmount: sql`${savingsGoals.currentAmount} + ${amount.toFixed(2)}`,
    })
    .where(eq(savingsGoals.id, goalId));
}

/**
 * Monthly sweep. Runs on the first sync of a new month:
 *   1. Look at the just-closed month.
 *   2. Sum positive slack across categories with a base budget.
 *      slack(cat) = max(0, effective - spent)   where effective = base + adjustments
 *   3. Move sweep_percent % of that total to the primary goal.
 *   4. Persist a sweep contribution and push an ntfy summary.
 *
 * "First sync of a new month" means: the previous sync run (before this one)
 * finished in an earlier month than "now". This piggybacks on the sync_runs
 * table without needing extra state.
 */
export async function runMonthlySweep(now = new Date()): Promise<{
  executed: boolean;
  month: string;
  sweptTotal?: number;
  goalId?: number;
}> {
  const nowMonth = monthOf(now);
  const targetMonth = prevMonth(nowMonth);

  // The current sync writes its row with finishedAt=NULL, then invokes the
  // behavior pipeline. So filtering finishedAt IS NOT NULL naturally excludes
  // the in-progress run. The most recent match is the actual previous sync.
  const [prevRun] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(sql`${syncRuns.finishedAt} is not null`)
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  if (prevRun && prevRun.finishedAt) {
    const prevMonthStr = monthOf(prevRun.finishedAt);
    if (prevMonthStr === nowMonth) {
      return { executed: false, month: targetMonth };
    }
  }

  // Already swept? Check for any 'sweep' contribution for targetMonth.
  const [existing] = await db
    .select({ id: savingsContributions.id })
    .from(savingsContributions)
    .where(
      and(
        eq(savingsContributions.source, "sweep"),
        eq(savingsContributions.month, targetMonth)
      )
    )
    .limit(1);
  if (existing) return { executed: false, month: targetMonth };

  // Compute slack for targetMonth.
  const { from, to } = monthRange(targetMonth);

  // Sanity gate — sweep only if the target month has actual booked activity.
  const [{ txCount }] = await db
    .select({ txCount: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(gte(transactions.bookingDate, from), lte(transactions.bookingDate, to)));
  if (txCount === 0) return { executed: false, month: targetMonth };

  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const spentRows = await db
    .select({
      categoryId: categories.id,
      base: sql<number | null>`${categories.budgetMonthly}::float`,
      spent: spentExpr,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, categories.id),
        gte(transactions.bookingDate, from),
        lte(transactions.bookingDate, to)
      )
    )
    .groupBy(categories.id);

  const adjRows = await db
    .select({
      categoryId: budgetAdjustments.categoryId,
      total: sql<number>`coalesce(sum(${budgetAdjustments.delta}::float), 0)::float`,
    })
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.month, targetMonth))
    .groupBy(budgetAdjustments.categoryId);

  const adjMap = new Map(adjRows.map((r) => [r.categoryId, r.total]));

  let totalSlack = 0;
  for (const r of spentRows) {
    const base = r.base ?? 0;
    if (base <= 0) continue;
    const eff = base + (adjMap.get(r.categoryId) ?? 0);
    const slack = eff - r.spent;
    if (slack > 0) totalSlack += slack;
  }
  if (totalSlack <= 0) return { executed: false, month: targetMonth };

  const [s] = await db.select().from(settings).limit(1);
  const sweepPct = s ? Number(s.sweepPercent) : 80;
  const toSweep = totalSlack * (sweepPct / 100);
  if (toSweep <= 0) return { executed: false, month: targetMonth };

  // Primary goal.
  const [primary] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.isPrimary, true), eq(savingsGoals.paused, false)))
    .limit(1);
  if (!primary) return { executed: false, month: targetMonth };

  await addContribution({
    goalId: primary.id,
    amount: toSweep,
    source: "sweep",
    month: targetMonth,
    note: `Auto-sweep from ${targetMonth} (${sweepPct}% of ${kr(totalSlack)} slack)`,
  });

  await sendNtfy(
    `${targetMonth} sweep: +${kr(toSweep)} → ${primary.name}`,
    {
      title: "Savings sweep",
      tags: ["moneybag"],
      priority: 3,
      click: env.appUrl + "/goals",
    }
  );

  return { executed: true, month: targetMonth, sweptTotal: toSweep, goalId: primary.id };
}

/** For dashboard sidebar. */
export async function getPrimaryGoal(): Promise<GoalSummary | null> {
  const all = await getGoals();
  return all.find((g) => g.isPrimary) ?? null;
}
