import { db } from "@/db";
import { transactions, categories, budgetAdjustments, settings } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { sendNtfy } from "@/lib/notify";
import { kr } from "@/lib/format";
import { env } from "@/lib/env";

/**
 * Adaptive/live budgeting.
 *
 * When a fresh transaction pushes its category over the trigger threshold
 * (default 90 % of the effective budget) AND there are ≥ MIN_DAYS_LEFT days
 * left in the month, we redistribute the overshoot from categories with the
 * most slack. Each donor category may lose at most cap % of its base budget.
 *
 * The redistribution is persisted as `budget_adjustments` rows: a negative
 * delta on the donor(s) and a positive delta on the recipient (net zero).
 *
 * "Effective budget" = base categories.budget_monthly + Σ adjustments for
 * that category in that month. All budget UI must use this effective value.
 */

const MIN_DAYS_LEFT = 7;

interface Settings {
  triggerPercent: number;
  capPercent: number;
}

async function loadSettings(): Promise<Settings> {
  const [s] = await db.select().from(settings).limit(1);
  return {
    triggerPercent: s ? Number(s.adaptiveTriggerPercent) : 90,
    capPercent: s ? Number(s.adaptiveCapPercent) : 20,
  };
}

function monthOf(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthRangeUTC(month: string): { from: string; to: string; daysInMonth: number; today: string } {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const daysInMonth = to.getUTCDate();
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    daysInMonth,
    today: new Date().toISOString().slice(0, 10),
  };
}

function daysLeftInMonth(month: string): number {
  const { to, today } = monthRangeUTC(month);
  const t = new Date(to + "T00:00:00Z").getTime();
  const n = new Date(today + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((t - n) / 86400_000));
}

interface CategoryState {
  categoryId: number;
  name: string;
  emoji: string;
  base: number; // categories.budget_monthly (nullable → 0 treated as unbudgeted)
  adj: number; // sum(budget_adjustments.delta) for this month
  spent: number;
  effective: number; // base + adj
  remaining: number; // effective - spent (may be negative)
}

/** Load per-category state for the given month. */
export async function loadCategoryState(month: string): Promise<CategoryState[]> {
  const { from, to } = monthRangeUTC(month);

  const spentExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      emoji: categories.emoji,
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
    .where(eq(budgetAdjustments.month, month))
    .groupBy(budgetAdjustments.categoryId);

  const adjMap = new Map(adjRows.map((r) => [r.categoryId, r.total]));

  return rows.map((r) => {
    const base = r.base ?? 0;
    const adj = adjMap.get(r.categoryId) ?? 0;
    const effective = base + adj;
    return {
      categoryId: r.categoryId,
      name: r.name,
      emoji: r.emoji,
      base,
      adj,
      spent: r.spent ?? 0,
      effective,
      remaining: effective - (r.spent ?? 0),
    };
  });
}

export interface AdaptiveResult {
  triggered: boolean;
  recipientCategoryId?: number;
  overshoot?: number;
  moves?: Array<{ fromCategoryId: number; fromName: string; amount: number }>;
}

/**
 * Run adaptive redistribution for a category that just breached the trigger.
 * Idempotent-ish: it recomputes based on current state and moves only the
 * unrecovered overshoot each call.
 */
export async function runAdaptiveRedistribution(
  categoryId: number,
  today = new Date()
): Promise<AdaptiveResult> {
  const month = today.toISOString().slice(0, 7);
  if (daysLeftInMonth(month) < MIN_DAYS_LEFT) {
    return { triggered: false };
  }

  const { triggerPercent, capPercent } = await loadSettings();
  const state = await loadCategoryState(month);
  const target = state.find((s) => s.categoryId === categoryId);
  if (!target || target.effective <= 0) return { triggered: false };

  const spendRatio = target.spent / target.effective;
  if (spendRatio < triggerPercent / 100) return { triggered: false };

  // Overshoot = the gap to fully cover this month's projected shortfall for
  // the recipient. We keep it conservative: cover just enough that spent =
  // effective, i.e. bring it to 100 %. Anything more can happen on the next
  // trigger later in the month.
  const overshoot = Math.max(0, target.spent - target.effective);
  const donation = overshoot > 0 ? overshoot : target.spent - target.effective * (triggerPercent / 100);
  if (donation <= 0) return { triggered: false };

  // Donors: positive-slack categories other than the recipient.
  const donors = state
    .filter((s) => s.categoryId !== categoryId && s.base > 0 && s.remaining > 0)
    .map((s) => ({
      ...s,
      cap: (capPercent / 100) * s.base,
      slack: Math.min(s.remaining, (capPercent / 100) * s.base),
    }))
    .filter((s) => s.slack > 0)
    .sort((a, b) => b.slack - a.slack);

  if (donors.length === 0) return { triggered: false };

  const totalSlack = donors.reduce((s, d) => s + d.slack, 0);
  const moveable = Math.min(donation, totalSlack);

  const moves: Array<{ fromCategoryId: number; fromName: string; amount: number }> = [];
  let remaining = moveable;
  for (const d of donors) {
    if (remaining <= 0) break;
    const take = Math.min(d.slack, (d.slack / totalSlack) * moveable);
    if (take <= 0) continue;
    moves.push({ fromCategoryId: d.categoryId, fromName: d.name, amount: take });
    remaining -= take;
  }

  // Round for kr display; drift is minimal.
  const totalMoved = moves.reduce((s, m) => s + m.amount, 0);
  if (totalMoved <= 0) return { triggered: false };

  // Persist: negative delta on donors, positive on recipient.
  const reason = `adaptive:${today.toISOString()}`;
  for (const m of moves) {
    await db.insert(budgetAdjustments).values({
      categoryId: m.fromCategoryId,
      month,
      delta: (-m.amount).toFixed(2),
      reason,
    });
  }
  await db.insert(budgetAdjustments).values({
    categoryId,
    month,
    delta: totalMoved.toFixed(2),
    reason,
  });

  await sendNtfy(
    `${target.emoji} ${target.name} +${kr(totalMoved)} · redistributed from ${moves
      .map((m) => m.fromName)
      .join(", ")}`,
    {
      title: "Budget rebalanced",
      tags: ["scales"],
      priority: 3,
      click: env.appUrl + "/budgets",
    }
  );

  return {
    triggered: true,
    recipientCategoryId: categoryId,
    overshoot: totalMoved,
    moves,
  };
}

/**
 * After a sync, walk each newly-inserted DBIT and, if it pushed its category
 * over the trigger, run redistribution once per affected category.
 */
export async function evaluateAdaptiveForCategories(
  categoryIds: number[],
  today = new Date()
): Promise<AdaptiveResult[]> {
  const uniq = Array.from(new Set(categoryIds)).filter((n) => Number.isFinite(n));
  const results: AdaptiveResult[] = [];
  for (const id of uniq) {
    const r = await runAdaptiveRedistribution(id, today);
    if (r.triggered) results.push(r);
  }
  return results;
}

/** Convenience — expose the map for use elsewhere (budget page, insights). */
export async function getMonthlyAdjustments(month: string) {
  const rows = await db
    .select({
      categoryId: budgetAdjustments.categoryId,
      total: sql<number>`coalesce(sum(${budgetAdjustments.delta}::float), 0)::float`,
    })
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.month, month))
    .groupBy(budgetAdjustments.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.total]));
}

// re-export for convenience
export { monthOf };
