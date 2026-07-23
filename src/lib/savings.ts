import { db } from "@/db";
import {
  savingsGoals,
  savingsContributions,
  settings,
  categories,
  transactions,
  budgetAdjustments,
  savingsEntries,
} from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, sql, gte, lte } from "drizzle-orm";
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

const SALARY_MIN = 18_000;
const SALARY_MAX = 30_000;

function addDays(isoStr: string, days: number): string {
  const d = new Date(isoStr + "T00:00:00Z");
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Salary-period sweep. Fires when a new salary lands:
 *   1. Detects the two most recent salary txns to define the just-closed period
 *      [prevSalaryDate, salaryDate − 1].
 *   2. Computes slack over that period (same category/budget logic as before).
 *   3. Records a *pending* sweep contribution (amount = slack × sweepPercent%).
 *      The pending row does NOT credit the goal yet.
 *   4. The user then tags the real Lysa tx via classifyTransactionAsSweep(),
 *      which confirms the pending row and credits the goal with the actual amount.
 *
 * Idempotency key: source = "sweep" AND periodStart = salaryDate.
 */
export async function runPeriodSweep(): Promise<{
  executed: boolean;
  salaryDate?: string;
  sweptTotal?: number;
  goalId?: number;
}> {
  // Two most recent salary txns.
  const salaryRows = await db
    .select({ bookingDate: transactions.bookingDate })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.direction, "CRDT"),
        eq(categories.name, "Income"),
        sql`${transactions.amount}::float between ${SALARY_MIN} and ${SALARY_MAX}`,
        isNotNull(transactions.bookingDate)
      )
    )
    .orderBy(desc(transactions.bookingDate))
    .limit(2);

  if (salaryRows.length < 2) {
    // Need at least two salaries to bound a closed period.
    return { executed: false };
  }

  const salaryDate = salaryRows[0].bookingDate!;     // most recent salary
  const prevSalaryDate = salaryRows[1].bookingDate!; // period start

  // Idempotency: already swept for this salary's period?
  const [existing] = await db
    .select({ id: savingsContributions.id })
    .from(savingsContributions)
    .where(
      and(
        eq(savingsContributions.source, "sweep"),
        eq(savingsContributions.periodStart, salaryDate)
      )
    )
    .limit(1);
  if (existing) return { executed: false, salaryDate };

  // Guard: only fire if this salary is newer than the last sweep's periodStart.
  const [lastSweep] = await db
    .select({ periodStart: savingsContributions.periodStart })
    .from(savingsContributions)
    .where(eq(savingsContributions.source, "sweep"))
    .orderBy(desc(savingsContributions.createdAt))
    .limit(1);
  if (lastSweep?.periodStart && lastSweep.periodStart >= salaryDate) {
    return { executed: false, salaryDate };
  }

  // Closed period: [prevSalaryDate, salaryDate − 1].
  const from = prevSalaryDate;
  const to = addDays(salaryDate, -1);

  // Sanity gate: period must have actual booked activity.
  const [{ txCount }] = await db
    .select({ txCount: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(gte(transactions.bookingDate, from), lte(transactions.bookingDate, to)));
  if (txCount === 0) return { executed: false, salaryDate };

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

  // Budget adjustments keyed to the period-start month.
  const adjMonth = prevSalaryDate.slice(0, 7);
  const adjRows = await db
    .select({
      categoryId: budgetAdjustments.categoryId,
      total: sql<number>`coalesce(sum(${budgetAdjustments.delta}::float), 0)::float`,
    })
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.month, adjMonth))
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
  if (totalSlack <= 0) return { executed: false, salaryDate };

  const [s] = await db.select().from(settings).limit(1);
  const sweepPct = s ? Number(s.sweepPercent) : 80;
  const toSweep = totalSlack * (sweepPct / 100);
  if (toSweep <= 0) return { executed: false, salaryDate };

  const [primary] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.isPrimary, true), eq(savingsGoals.paused, false)))
    .limit(1);
  if (!primary) return { executed: false, salaryDate };

  await addContribution({
    goalId: primary.id,
    amount: toSweep,
    source: "sweep",
    month: prevSalaryDate.slice(0, 7),
    note: `Suggested sweep for period ${from} – ${to} (${sweepPct}% of ${kr(totalSlack)} slack)`,
    periodStart: salaryDate,
    pending: true,
  });

  await sendNtfy(
    `Salary landed — suggested sweep: ${kr(toSweep)} → ${primary.name}`,
    {
      title: "Savings sweep ready",
      tags: ["moneybag"],
      priority: 3,
      click: env.appUrl + "/goals",
    }
  );

  return { executed: true, salaryDate, sweptTotal: toSweep, goalId: primary.id };
}

/**
 * Classify an existing DBIT transaction as the real Lysa sweep transfer.
 *
 *   - Finds the most recent pending sweep contribution for the primary goal.
 *   - If found: confirms it — sets pending=false, links the tx, overrides amount
 *     with the real transfer amount, and credits the goal.
 *   - If not found: creates a new (non-pending) sweep contribution directly.
 */
export async function classifyTransactionAsSweep(txId: number): Promise<{
  ok: boolean;
  contribution?: typeof savingsContributions.$inferSelect;
  error?: string;
}> {
  const [tx] = await db
    .select({
      id: transactions.id,
      direction: transactions.direction,
      amount: sql<number>`${transactions.amount}::float`,
      bookingDate: transactions.bookingDate,
    })
    .from(transactions)
    .where(eq(transactions.id, txId))
    .limit(1);

  if (!tx) return { ok: false, error: "transaction not found" };
  if (tx.direction !== "DBIT") return { ok: false, error: "only DBIT transactions can be sweep transfers" };

  // Already linked?
  const [alreadyLinked] = await db
    .select({ id: savingsContributions.id })
    .from(savingsContributions)
    .where(eq(savingsContributions.transactionId, txId))
    .limit(1);
  if (alreadyLinked) return { ok: false, error: "transaction already classified as a sweep" };

  const [primary] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.isPrimary, true), eq(savingsGoals.paused, false)))
    .limit(1);
  if (!primary) return { ok: false, error: "no active primary goal" };

  // Most recent pending sweep for the primary goal.
  const [pendingRow] = await db
    .select()
    .from(savingsContributions)
    .where(
      and(
        eq(savingsContributions.goalId, primary.id),
        eq(savingsContributions.source, "sweep"),
        eq(savingsContributions.pending, true)
      )
    )
    .orderBy(desc(savingsContributions.createdAt))
    .limit(1);

  if (pendingRow) {
    // Confirm the suggestion with the real tx amount.
    const [updated] = await db
      .update(savingsContributions)
      .set({
        pending: false,
        transactionId: txId,
        amount: tx.amount.toFixed(2),
        note: `${pendingRow.note ?? "Sweep"} — confirmed tx#${txId}`,
      })
      .where(eq(savingsContributions.id, pendingRow.id))
      .returning();

    // Credit the goal (pending row never bumped it).
    await db
      .update(savingsGoals)
      .set({ currentAmount: sql`${savingsGoals.currentAmount} + ${tx.amount.toFixed(2)}` })
      .where(eq(savingsGoals.id, primary.id));

    return { ok: true, contribution: updated };
  }

  // No pending suggestion — create a fresh sweep contribution directly.
  const row = await addContribution({
    goalId: primary.id,
    amount: tx.amount,
    source: "sweep",
    month: tx.bookingDate ? tx.bookingDate.slice(0, 7) : monthOf(new Date()),
    note: `Manual sweep tag tx#${txId}`,
    transactionId: txId,
    pending: false,
  });

  return { ok: true, contribution: row };
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