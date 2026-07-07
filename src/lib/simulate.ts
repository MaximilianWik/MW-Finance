import { db } from "@/db";
import { categories, transactions, budgetAdjustments, settings } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

/**
 * What-if simulator.
 *
 * Given a hypothetical purchase (amount + categoryId + optional day), compute
 * what the adaptive engine WOULD do without actually persisting anything.
 * Returns the resulting effective budgets across every category plus the
 * knock-on impact on the projected end-of-month sweep.
 */

export interface SimulateInput {
  amount: number;
  categoryId: number;
  day?: number; // day of month for the hypothetical purchase (default: today)
}

export interface SimulatedCategory {
  categoryId: number;
  name: string;
  color: string;
  base: number;
  currentAdjust: number;
  simulatedDelta: number; // change vs currentAdjust from the simulation
  effectiveBefore: number;
  effectiveAfter: number;
  spentBefore: number;
  spentAfter: number;
  slackBefore: number;
  slackAfter: number;
}

export interface SimulateResult {
  ok: boolean;
  reason?: string;
  month: string;
  input: SimulateInput;
  rows: SimulatedCategory[];
  sweepBefore: number;
  sweepAfter: number;
  sweepDelta: number;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    daysInMonth: to.getUTCDate(),
  };
}

export async function simulate(input: SimulateInput): Promise<SimulateResult> {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const { from, to } = monthRange(month);

  const [s] = await db.select().from(settings).limit(1);
  const sweepPct = s ? Number(s.sweepPercent) : 80;
  const capPct = s ? Number(s.adaptiveCapPercent) : 20;
  const triggerPct = s ? Number(s.adaptiveTriggerPercent) : 90;

  // Load base + spent per category.
  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
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
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const adjRows = await db
    .select({
      categoryId: budgetAdjustments.categoryId,
      total: sql<number>`coalesce(sum(${budgetAdjustments.delta}::float), 0)::float`,
    })
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.month, month))
    .groupBy(budgetAdjustments.categoryId);
  const adjMap = new Map(adjRows.map((r) => [r.categoryId, r.total]));

  const state = rows.map((r) => {
    const base = r.base ?? 0;
    const adj = adjMap.get(r.categoryId) ?? 0;
    return {
      categoryId: r.categoryId,
      name: r.name,
      color: r.color,
      base,
      adj,
      spent: r.spent ?? 0,
      effective: base + adj,
    };
  });

  const target = state.find((s) => s.categoryId === input.categoryId);
  if (!target) {
    return {
      ok: false,
      reason: "unknown category",
      month,
      input,
      rows: [],
      sweepBefore: 0,
      sweepAfter: 0,
      sweepDelta: 0,
    };
  }

  // Simulate: add input.amount to target's spent.
  const newSpentTarget = target.spent + input.amount;
  const newRatio = target.effective > 0 ? newSpentTarget / target.effective : Infinity;
  const trigger = newRatio >= triggerPct / 100 && target.effective > 0;

  // If triggered, redistribute the OVER-100 %-effective portion (same rule as
  // adaptive.ts).
  let moves: Array<{ fromCategoryId: number; amount: number }> = [];
  if (trigger) {
    const overshoot = Math.max(0, newSpentTarget - target.effective);
    const donation =
      overshoot > 0
        ? overshoot
        : newSpentTarget - target.effective * (triggerPct / 100);
    if (donation > 0) {
      const donors = state
        .filter((c) => c.categoryId !== input.categoryId && c.base > 0)
        .map((c) => {
          const cap = (capPct / 100) * c.base;
          const slack = Math.min(Math.max(0, c.effective - c.spent), cap);
          return { ...c, slack };
        })
        .filter((c) => c.slack > 0)
        .sort((a, b) => b.slack - a.slack);
      const totalSlack = donors.reduce((s, d) => s + d.slack, 0);
      const moveable = Math.min(donation, totalSlack);
      for (const d of donors) {
        const take = totalSlack > 0 ? (d.slack / totalSlack) * moveable : 0;
        if (take > 0) moves.push({ fromCategoryId: d.categoryId, amount: take });
      }
    }
  }

  const moveMap = new Map(moves.map((m) => [m.fromCategoryId, m.amount]));
  const totalMoved = moves.reduce((s, m) => s + m.amount, 0);

  const outRows: SimulatedCategory[] = state.map((c) => {
    const isTarget = c.categoryId === input.categoryId;
    const outflow = moveMap.get(c.categoryId) ?? 0;
    const simDelta = isTarget ? totalMoved : -outflow;
    const effectiveAfter = c.effective + simDelta;
    const spentAfter = c.spent + (isTarget ? input.amount : 0);
    return {
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      base: c.base,
      currentAdjust: c.adj,
      simulatedDelta: simDelta,
      effectiveBefore: c.effective,
      effectiveAfter,
      spentBefore: c.spent,
      spentAfter,
      slackBefore: Math.max(0, c.effective - c.spent),
      slackAfter: Math.max(0, effectiveAfter - spentAfter),
    };
  });

  // Sweep impact — total slack across budgeted categories × sweep %.
  const slackBefore = outRows.reduce((s, r) => s + (r.base > 0 ? r.slackBefore : 0), 0);
  const slackAfter = outRows.reduce((s, r) => s + (r.base > 0 ? r.slackAfter : 0), 0);
  const sweepBefore = slackBefore * (sweepPct / 100);
  const sweepAfter = slackAfter * (sweepPct / 100);

  return {
    ok: true,
    month,
    input,
    rows: outRows,
    sweepBefore,
    sweepAfter,
    sweepDelta: sweepAfter - sweepBefore,
  };
}
