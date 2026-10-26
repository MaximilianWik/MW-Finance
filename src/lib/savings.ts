import { db } from "@/db";
import {
  savingsGoals,
  savingsContributions,
  goalAccounts,
  categories,
  transactions,
  savingsEntries,
} from "@/db/schema";
import { and, desc, eq, ilike, sql, gte, lte } from "drizzle-orm";
import { getInvestmentAccounts } from "@/lib/investments";
import { getAllSalaryCycles } from "@/lib/period";
import { median } from "@/lib/budget-baseline";
import {
  monthsToTarget,
  addMonths,
  milestones,
  trackStatus,
  type Milestone,
} from "@/lib/goal-math";

/** Formatted YYYY-MM for a given date. */
function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export interface GoalAccountLink {
  accountId: number;
  name: string;
  color: string;
  sharePct: number;
  balance: number; // account balance (seed + deposits − withdrawals)
  value: number; // balance × share: what it adds to the goal
}

export interface GoalCycle {
  label: string;
  from: string;
  to: string;
  amount: number; // net deposits (× share) + manual contributions in that cycle
}

export interface GoalSummary {
  id: number;
  name: string;
  target: number;
  current: number; // manualValue + linkedValue
  currency: string;
  imageUrl: string | null;
  isPrimary: boolean;
  paused: boolean;
  targetDate: string | null;
  velocity: number; // pace: median kr per finished salary cycle (last 6), floored at 0
  netPace: number; // same median, not floored (negative = more taken out than put in)
  monthsToGoal: number | null; // at pace, 0% return; null = no pace
  progressPct: number;
  manualValue: number; // savings_goals.current_amount (manual contributions)
  linkedValue: number; // Σ linked account balance × share
  accounts: GoalAccountLink[];
  history: GoalCycle[]; // latest first
  etaDate: string | null;
  track: ReturnType<typeof trackStatus>;
  milestones: Milestone[];
}

const PACE_CYCLES = 6;

/**
 * Goals valued live from their linked investment accounts plus manual
 * contributions. Pace = median per-cycle inflow over the last finished salary
 * cycles, so one big or missed deposit doesn't swing the ETA.
 */
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

  const [links, { accounts }, allCycles] = await Promise.all([
    db
      .select({
        goalId: goalAccounts.goalId,
        accountId: goalAccounts.accountId,
        sharePct: sql<number>`${goalAccounts.sharePct}::float`,
      })
      .from(goalAccounts),
    getInvestmentAccounts(),
    getAllSalaryCycles(),
  ]);
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const cycles = allCycles
    .filter((c): c is typeof c & { to: string } => c.to != null)
    .slice(0, PACE_CYCLES);
  const cycleIndex = (date: string) => cycles.findIndex((c) => date >= c.from && date <= c.to);

  // Net deposits per linked account per cycle (same merchant match as investments.ts).
  const netByAccount = new Map<number, number[]>();
  if (cycles.length) {
    const winFrom = cycles[cycles.length - 1].from;
    const winTo = cycles[0].to;
    const linkedIds = [...new Set(links.map((l) => l.accountId))];
    await Promise.all(
      linkedIds.map(async (id) => {
        const acc = accById.get(id);
        const net = new Array<number>(cycles.length).fill(0);
        netByAccount.set(id, net);
        if (!acc?.merchant) return;
        const rows = await db
          .select({
            date: transactions.bookingDate,
            direction: transactions.direction,
            amount: sql<number>`${transactions.amount}::float`,
          })
          .from(transactions)
          .where(
            and(
              ilike(transactions.merchant, `%${acc.merchant}%`),
              gte(transactions.bookingDate, winFrom),
              lte(transactions.bookingDate, winTo)
            )
          );
        for (const r of rows) {
          if (!r.date) continue;
          const i = cycleIndex(r.date);
          if (i >= 0) net[i] += r.direction === "DBIT" ? r.amount : -r.amount;
        }
      })
    );
  }

  // Manual contributions per goal per cycle (by the day they were added).
  const contribs = await db
    .select({
      goalId: savingsContributions.goalId,
      amount: sql<number>`${savingsContributions.amount}::float`,
      createdAt: savingsContributions.createdAt,
    })
    .from(savingsContributions)
    .where(eq(savingsContributions.pending, false));
  const manualByGoal = new Map<number, number[]>();
  for (const c of contribs) {
    const i = cycleIndex(new Date(c.createdAt).toISOString().slice(0, 10));
    if (i < 0) continue;
    const arr = manualByGoal.get(c.goalId) ?? new Array<number>(cycles.length).fill(0);
    arr[i] += c.amount;
    manualByGoal.set(c.goalId, arr);
  }

  const today = new Date().toISOString().slice(0, 10);

  return goals.map((g) => {
    const goalLinks: GoalAccountLink[] = links
      .filter((l) => l.goalId === g.id && accById.has(l.accountId))
      .map((l) => {
        const acc = accById.get(l.accountId)!;
        return {
          accountId: acc.id,
          name: acc.name,
          color: acc.color,
          sharePct: l.sharePct,
          balance: acc.currentBalance,
          value: Math.round((acc.currentBalance * l.sharePct) / 100),
        };
      });
    const linkedValue = goalLinks.reduce((s, l) => s + l.value, 0);
    const current = g.current + linkedValue;

    const history: GoalCycle[] = cycles.map((c, i) => {
      const fromAccounts = goalLinks.reduce(
        (s, l) => s + ((netByAccount.get(l.accountId)?.[i] ?? 0) * l.sharePct) / 100,
        0
      );
      return { label: c.label, from: c.from, to: c.to, amount: Math.round(fromAccounts + (manualByGoal.get(g.id)?.[i] ?? 0)) };
    });
    const netPace = Math.round(median(history.map((h) => h.amount)));
    const velocity = Math.max(0, netPace);
    const monthsToGoal = monthsToTarget(current, g.target, velocity);

    return {
      id: g.id,
      name: g.name,
      target: g.target,
      current,
      currency: g.currency,
      imageUrl: g.imageUrl,
      isPrimary: g.isPrimary,
      paused: g.paused,
      targetDate: g.targetDate,
      velocity,
      netPace,
      monthsToGoal,
      progressPct: g.target > 0 ? Math.min(1, current / g.target) : 0,
      manualValue: g.current,
      linkedValue,
      accounts: goalLinks,
      history,
      etaDate: monthsToGoal == null ? null : addMonths(today, monthsToGoal),
      track: trackStatus(current, g.target, velocity, today, g.targetDate),
      milestones: milestones(current, g.target, velocity, today),
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
      transactionId: savingsContributions.transactionId,
      periodStart: savingsContributions.periodStart,
      pending: savingsContributions.pending,
      createdAt: savingsContributions.createdAt,
    })
    .from(savingsContributions)
    .where(eq(savingsContributions.goalId, goalId))
    .orderBy(desc(savingsContributions.createdAt));
}

/** Add a contribution and bump the goal's current_amount atomically (unless pending). */
export async function addContribution(params: {
  goalId: number;
  amount: number;
  source?: "manual" | "sweep";
  month?: string;
  note?: string;
  transactionId?: number;
  periodStart?: string;
  pending?: boolean;
}) {
  const { goalId, amount, source = "manual", month, note, transactionId, periodStart, pending = false } = params;
  if (amount <= 0) throw new Error("amount must be > 0");
  const [row] = await db.insert(savingsContributions).values({
    goalId,
    amount: amount.toFixed(2),
    source,
    month: month ?? monthOf(new Date()),
    note,
    transactionId: transactionId ?? null,
    periodStart: periodStart ?? null,
    pending,
  }).returning();
  // Pending contributions are suggestions only — don't credit the goal yet.
  if (!pending) {
    await db
      .update(savingsGoals)
      .set({
        currentAmount: sql`${savingsGoals.currentAmount} + ${amount.toFixed(2)}`,
      })
      .where(eq(savingsGoals.id, goalId));
  }
  return row;
}

/** For dashboard sidebar. */
export async function getPrimaryGoal(): Promise<GoalSummary | null> {
  const all = await getGoals();
  return all.find((g) => g.isPrimary) ?? null;
}


// --- Savings total (Phase 2) -------------------------------------------------
export interface SavingsEntryRow {
  id: number;
  amount: number;
  note: string | null;
  occurredOn: string | null;
  kind: "manual";
}

export interface SavingsTotal {
  fromTransactions: number; // sum of outflows categorized "Savings"
  fromManual: number;       // sum of manual savings_entries
  total: number;
  recentEntries: SavingsEntryRow[];
}

/**
 * All-time savings total = outflows categorized "Savings" + manual entries.
 * Returns the two components, the combined total, and the latest manual rows.
 */
export async function getSavingsTotal(): Promise<SavingsTotal> {
  const [txAgg] = await db
    .select({
      total: sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(categories.name, "Savings"));
  const fromTransactions = txAgg?.total ?? 0;

  const [manualAgg] = await db
    .select({ total: sql<number>`coalesce(sum(${savingsEntries.amount}::float), 0)::float` })
    .from(savingsEntries);
  const fromManual = manualAgg?.total ?? 0;

  const recent = await db
    .select({
      id: savingsEntries.id,
      amount: sql<number>`${savingsEntries.amount}::float`,
      note: savingsEntries.note,
      occurredOn: savingsEntries.occurredOn,
    })
    .from(savingsEntries)
    .orderBy(desc(savingsEntries.occurredOn), desc(savingsEntries.id))
    .limit(10);

  const recentEntries: SavingsEntryRow[] = recent.map((e) => ({
    ...e,
    kind: "manual" as const,
  }));

  return {
    fromTransactions,
    fromManual,
    total: fromTransactions + fromManual,
    recentEntries,
  };
}

/** Add a manual savings entry. */
export async function addSavingsEntry(params: {
  amount: number;
  note?: string | null;
  occurredOn?: string;
}) {
  if (params.amount <= 0) throw new Error("amount must be > 0");
  const [row] = await db
    .insert(savingsEntries)
    .values({
      amount: params.amount.toFixed(2),
      note: params.note ?? null,
      occurredOn: params.occurredOn ?? new Date().toISOString().slice(0, 10),
    })
    .returning();
  return row;
}

/** Delete a manual savings entry by id. */
export async function deleteSavingsEntry(id: number) {
  await db.delete(savingsEntries).where(eq(savingsEntries.id, id));
}