import { db } from "@/db";
import { categories, transactions, recurringPayments } from "@/db/schema";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getAllSalaryCycles } from "@/lib/period";
import { getSavingsTotal, getPrimaryGoal } from "@/lib/savings";
import { kr } from "@/lib/format";
import { findOneOffs, cycleBaselines, type SpendTx, type OneOff } from "@/lib/budget-baseline";
import { isLocked } from "@/lib/budget-rules";

const BASELINE_CYCLES = 6; // finished salary cycles used for the median baseline

/**
 * Financial context builder — the single source of truth every Gemini consumer
 * (assistant, budget recalibration, behavior analysis) shares. Pulls a compact
 * snapshot of the user's money: income, per-category budgets + spend, recurring
 * bills, goals, savings, and recent anomalies.
 */

export interface CategoryContext {
  id: number;
  name: string;
  color: string;
  budgetMonthly: number | null;
  budgetSource: string | null; // ai | manual | null
  avgMonthlySpend: number;     // averaged over the last N salary cycles
  medianMonthlySpend: number;  // median of the last finished cycles, one-offs excluded
  cycleSpend: number[];        // spend per finished cycle (latest first), one-offs excluded
  currentSpent: number;        // spend in the current cycle
}

export interface RecurringContext {
  merchant: string;
  notes: string | null;
  amount: number;
  cadence: string;
  variableAmount: boolean;
  manual: boolean;
}

export interface FlaggedContext {
  date: string | null;
  merchant: string | null;
  amount: number;
  reason: string | null;
}

export interface FinancialContext {
  generatedAt: string;
  cycleLabel: string;
  nCycles: number;
  monthlyIncome: number;
  savingsTotal: number;
  primaryGoal: { name: string; current: number; target: number; monthsToGoal: number | null } | null;
  categories: CategoryContext[];
  recurring: RecurringContext[];
  flagged: FlaggedContext[];
  baselineCycles: number;           // finished cycles behind medianMonthlySpend
  oneOffs: Array<OneOff & { categoryName: string }>; // excluded from the baseline
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

/** Structured snapshot — used directly by budget recalibration. */
export async function getFinancialContext(): Promise<FinancialContext> {
  const allCycles = await getAllSalaryCycles();
  const cycles = allCycles.slice(0, 3);
  // Finished cycles only (the open one has to=null): latest first.
  const finished = allCycles
    .filter((c): c is typeof c & { to: string } => c.to != null)
    .slice(0, BASELINE_CYCLES);
  const nCycles = cycles.length || 1;
  const earliestFrom = cycles.length ? cycles[cycles.length - 1].from : isoDaysAgo(90);

  const [cats, status, savings, primaryGoal, spendRows, incomeRow, recurringRows, flaggedRows] =
    await Promise.all([
      db.select().from(categories).orderBy(categories.sort),
      getMonthlyBudgetStatus(),
      getSavingsTotal(),
      getPrimaryGoal(),
      // DBIT spend per category across the window.
      db
        .select({
          categoryId: transactions.categoryId,
          spent: sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`,
        })
        .from(transactions)
        .where(and(gte(transactions.bookingDate, earliestFrom), isNotNull(transactions.categoryId)))
        .groupBy(transactions.categoryId),
      // CRDT Income across the window.
      db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactions.direction} = 'CRDT' then ${transactions.amount}::float else 0 end), 0)::float`,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(gte(transactions.bookingDate, earliestFrom), eq(categories.name, "Income"))),
      db
        .select({
          merchant: recurringPayments.merchant,
          notes: recurringPayments.notes,
          amount: sql<number>`${recurringPayments.amount}::float`,
          cadence: recurringPayments.cadence,
          variableAmount: recurringPayments.variableAmount,
          manual: recurringPayments.manual,
        })
        .from(recurringPayments)
        .where(eq(recurringPayments.active, true))
        .orderBy(desc(recurringPayments.amount)),
      db
        .select({
          date: transactions.bookingDate,
          merchant: transactions.counterpartyName,
          amount: sql<number>`${transactions.amount}::float`,
          reason: transactions.flaggedReason,
        })
        .from(transactions)
        .where(isNotNull(transactions.flaggedReason))
        .orderBy(desc(transactions.bookingDate), desc(transactions.id))
        .limit(8),
    ]);

  // ── Baseline: every purchase in the finished cycles ──
  const baseTxs: SpendTx[] = finished.length
    ? (
        await db
          .select({
            id: transactions.id,
            categoryId: transactions.categoryId,
            amount: sql<number>`(-${transactions.signed})::float`,
            bookingDate: transactions.bookingDate,
            merchant: transactions.counterpartyName,
          })
          .from(transactions)
          .where(
            and(
              sql`${transactions.signed} < 0`,
              isNotNull(transactions.categoryId),
              gte(transactions.bookingDate, finished[finished.length - 1].from),
              lte(transactions.bookingDate, finished[0].to)
            )
          )
      ).filter((t): t is SpendTx => t.categoryId != null && t.bookingDate != null)
    : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const lockedIds = new Set(cats.filter((c) => isLocked(c.name)).map((c) => c.id));
  const oneOffs = findOneOffs(baseTxs, lockedIds);
  const baselines = cycleBaselines(baseTxs, finished, new Set(oneOffs.map((o) => o.id)));

  const spentByCat = new Map(spendRows.map((r) => [r.categoryId, r.spent]));
  const currentByCat = new Map(status.rows.map((r) => [r.categoryId, r.spent]));

  const categoriesCtx: CategoryContext[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    budgetMonthly: c.budgetMonthly == null ? null : Number(c.budgetMonthly),
    budgetSource: c.budgetSource ?? null,
    avgMonthlySpend: Math.round((spentByCat.get(c.id) ?? 0) / nCycles),
    medianMonthlySpend: baselines.get(c.id)?.median ?? 0,
    cycleSpend: baselines.get(c.id)?.perCycle ?? new Array<number>(finished.length).fill(0),
    currentSpent: Math.round(currentByCat.get(c.id) ?? 0),
  }));

  const monthlyIncome = Math.round((incomeRow[0]?.total ?? 0) / nCycles);

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    cycleLabel: status.label,
    nCycles,
    monthlyIncome,
    savingsTotal: Math.round(savings.total),
    primaryGoal: primaryGoal
      ? {
          name: primaryGoal.name,
          current: Math.round(primaryGoal.current),
          target: Math.round(primaryGoal.target),
          monthsToGoal: primaryGoal.monthsToGoal,
        }
      : null,
    categories: categoriesCtx,
    recurring: recurringRows.map((r) => ({
      merchant: r.merchant,
      notes: r.notes,
      amount: Math.round(r.amount),
      cadence: r.cadence,
      variableAmount: r.variableAmount,
      manual: r.manual,
    })),
    flagged: flaggedRows.map((r) => ({
      date: r.date,
      merchant: r.merchant,
      amount: Math.round(r.amount),
      reason: r.reason,
    })),
    baselineCycles: finished.length,
    oneOffs: oneOffs
      .sort((a, b) => b.amount - a.amount)
      .map((o) => ({ ...o, categoryName: catName.get(o.categoryId) ?? "?" })),
  };
}

/** Compact human-readable text block — injected into assistant / analysis prompts. */
export function formatContext(ctx: FinancialContext): string {
  const lines: string[] = [];
  lines.push(`FINANCIAL CONTEXT (generated ${ctx.generatedAt}, averaged over ${ctx.nCycles} salary cycle(s))`);
  lines.push(`Current cycle: ${ctx.cycleLabel}`);
  lines.push(`Estimated monthly income: ${kr(ctx.monthlyIncome)}`);
  lines.push(`All-time savings: ${kr(ctx.savingsTotal)}`);
  if (ctx.primaryGoal) {
    const eta = ctx.primaryGoal.monthsToGoal != null ? ` (ETA ${Math.ceil(ctx.primaryGoal.monthsToGoal)}mo)` : "";
    lines.push(`Primary goal: ${ctx.primaryGoal.name} — ${kr(ctx.primaryGoal.current)} / ${kr(ctx.primaryGoal.target)}${eta}`);
  }

  lines.push("");
  lines.push("CATEGORIES (budget | avg monthly spend | current-cycle spend | source):");
  for (const c of ctx.categories) {
    if (c.name === "Transfers") continue;
    const budget = c.budgetMonthly != null ? kr(c.budgetMonthly) : "—";
    lines.push(`- ${c.name}: budget ${budget} | avg ${kr(c.avgMonthlySpend)} | now ${kr(c.currentSpent)} | source ${c.budgetSource ?? "—"}`);
  }

  lines.push("");
  lines.push("RECURRING PAYMENTS / BILLS:");
  if (ctx.recurring.length === 0) {
    lines.push("- (none detected)");
  } else {
    for (const r of ctx.recurring) {
      const label = r.notes ?? r.merchant;
      const variable = r.variableAmount ? " variable" : "";
      const src = r.manual ? "manual" : "auto";
      lines.push(`- ${label}: ${kr(r.amount)} ${r.cadence}${variable} (${src})`);
    }
  }

  if (ctx.flagged.length > 0) {
    lines.push("");
    lines.push("RECENT ANOMALIES / FLAGGED:");
    for (const f of ctx.flagged) {
      lines.push(`- ${f.date ?? "?"} ${f.merchant ?? "?"} ${kr(f.amount)} — ${f.reason ?? ""}`);
    }
  }

  return lines.join("\n");
}

/** Convenience: structured fetch + text format in one call. */
export async function buildFinancialContext(): Promise<string> {
  return formatContext(await getFinancialContext());
}
