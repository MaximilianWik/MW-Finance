import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { geminiModel } from "./client";
import { getFinancialContext, type FinancialContext } from "./context";
import { isLocked } from "@/lib/budget-rules";
import { clampChange } from "@/lib/budget-baseline";

/** Max change per category per recalibration (C). Written guidance lifts it. */
export const MAX_CHANGE_PCT = 0.2;

/**
 * AI budget setting / recalibration.
 *
 * The AI identifies income, spending habits, and recurring commitments, then
 * proposes a realistic monthly budget per category. Manual budgets are never
 * overwritten — the apply step skips any category stamped budgetSource='manual'.
 *
 * Guard rails enforced in CODE after the AI answers (not left to the prompt):
 *   - locked categories (Savings, Bills, Income, …) are dropped;
 *   - each change is clamped to ±MAX_CHANGE_PCT of the current budget,
 *     unless the user wrote guidance.
 */

export interface BudgetSet {
  categoryId: number | null; // null = resolve by name (or a new category)
  name: string;
  monthly: number; // final value (after the ±20% clamp)
  weekly?: number | null;
  rationale: string;
  current?: number | null; // budget before this run
  median?: number; // baseline the AI saw
  aiMonthly?: number; // what the AI asked for, before the clamp
  clamped?: boolean;
}

export interface NewCategoryProposal {
  name: string;
  color?: string;
  monthly: number;
  rationale: string;
}

export interface BudgetProposal {
  reasoning: string[];
  sets: BudgetSet[];
  newCategories: NewCategoryProposal[];
  guided: boolean; // guidance given → clamp lifted
  baselineCycles: number;
  oneOffs: FinancialContext["oneOffs"];
  dropped: Array<{ name: string; reason: string }>; // removed by the guard rails
  unchanged: number;
}

export interface ApplyAction {
  kind: "set" | "new" | "skip";
  name: string;
  monthly?: number;
  reason?: string;
}

const SYSTEM = [
  "You are the MWFinance budget engine. You set realistic monthly spending budgets from the user's actual data.",
  "Return JSON only, matching this exact shape:",
  '{ "reasoning": string[], "sets": [{ "categoryId": number|null, "name": string, "monthly": number, "weekly": number|null, "rationale": string }], "newCategories": [{ "name": string, "color": string, "monthly": number, "rationale": string }] }',
  "",
  "RULES:",
  "- Base budgets on medianSpend: the MEDIAN spend of the last finished salary cycles, with one-off purchases already removed. cycleSpend lists those cycles (latest first): use it to see a steady trend, but NEVER raise a budget because of one heavy cycle.",
  "- One-off purchases are listed separately. They are not normal spending: do not budget for them.",
  "- Round to clean figures (nearest 50 or 100 kr). The engine limits every change to ±20% of the current budget per run, so propose the level you think is right.",
  "- Locked categories are fixed (bills follow the bills checklist; savings are set by the user). NEVER include them in 'sets'.",
  "- Total of all budgets must leave room for savings — do NOT let budgets exceed monthly income.",
  "- NEVER propose a change for a category whose source is 'manual'. Omit it from 'sets' entirely.",
  "- Only propose newCategories when the data clearly shows recurring spend that has no fitting existing category. Prefer reusing existing categories.",
  "- Do not budget the Income, Savings, Investments, Transfers, Swish or Uncategorized categories in 'sets'.",
  "- 'reasoning' = 3–6 short terminal-style lines explaining the logic. No markdown, no emoji.",
].join("\n");

function buildPrompt(ctx: FinancialContext, guidance?: string): string {
  const catLines = ctx.categories
    .filter((c) => !isLocked(c.name))
    .map(
      (c) =>
        `  { id: ${c.id}, name: "${c.name}", currentBudget: ${c.budgetMonthly ?? "null"}, medianSpend: ${c.medianMonthlySpend}, cycleSpend: [${c.cycleSpend.join(", ")}], source: "${c.budgetSource ?? "none"}" }`
    );
  const lockedLines = ctx.categories
    .filter((c) => isLocked(c.name) && c.budgetMonthly != null)
    .map((c) => `  - ${c.name}: ${c.budgetMonthly} kr (locked)`);
  const oneOffLines = ctx.oneOffs.map(
    (o) => `  - ${o.bookingDate} ${o.merchant ?? "?"}: ${Math.round(o.amount)} kr in ${o.categoryName} (normal purchase there ~${Math.round(o.typical)} kr)`
  );
  const recurringLines = ctx.recurring.map(
    (r) => `  - ${r.notes ?? r.merchant}: ${r.amount} kr ${r.cadence}${r.variableAmount ? " (variable)" : ""}`
  );
  return [
    `Monthly income (avg over ${ctx.nCycles} cycle(s)): ${ctx.monthlyIncome} kr`,
    `All-time savings: ${ctx.savingsTotal} kr`,
    ctx.primaryGoal
      ? `Primary goal: ${ctx.primaryGoal.name}, ${ctx.primaryGoal.current}/${ctx.primaryGoal.target} kr`
      : "Primary goal: none",
    "",
    `Categories (baseline = last ${ctx.baselineCycles} finished salary cycle(s)):`,
    ...catLines,
    "",
    "Locked categories (fixed, count them as committed spend, never propose them):",
    ...(lockedLines.length ? lockedLines : ["  (none)"]),
    "",
    "One-off purchases (excluded from medianSpend):",
    ...(oneOffLines.length ? oneOffLines : ["  (none)"]),
    "",
    "Recurring commitments:",
    ...(recurringLines.length ? recurringLines : ["  (none)"]),
    ...(guidance
      ? [
          "",
          "USER GUIDANCE (highest priority — follow it explicitly, even if it overrides the spend history):",
          guidance,
        ]
      : []),
    "",
    "Propose the budget now. JSON only.",
  ].join("\n");
}

/** Ask Gemini for a budget proposal. Pure — writes nothing. */
export async function proposeBudget(guidance?: string): Promise<BudgetProposal> {
  const ctx = await getFinancialContext();
  const model = geminiModel({ system: SYSTEM, json: true, temperature: 0.3 });
  const res = await model.generateContent(buildPrompt(ctx, guidance));
  const parsed = JSON.parse(res.response.text()) as Partial<BudgetProposal>;

  const rawSets: BudgetSet[] = Array.isArray(parsed.sets)
      ? parsed.sets
          .filter((s) => s && typeof s.name === "string" && typeof s.monthly === "number")
          .map((s) => ({
            categoryId: typeof s.categoryId === "number" ? s.categoryId : null,
            name: s.name,
            monthly: Math.round(s.monthly),
            weekly: typeof s.weekly === "number" ? Math.round(s.weekly) : null,
            rationale: typeof s.rationale === "string" ? s.rationale : "",
          }))
      : [];

  // ── Guard rails, in code ──
  const guided = !!guidance;
  const byId = new Map(ctx.categories.map((c) => [c.id, c]));
  const byName = new Map(ctx.categories.map((c) => [c.name.toLowerCase(), c]));
  const dropped: BudgetProposal["dropped"] = [];
  const sets: BudgetSet[] = [];
  let unchanged = 0;
  for (const s of rawSets) {
    const cat = (s.categoryId != null ? byId.get(s.categoryId) : undefined) ?? byName.get(s.name.toLowerCase());
    if (!cat) {
      sets.push(s); // unknown → apply step reports it
      continue;
    }
    if (isLocked(cat.name)) {
      dropped.push({ name: cat.name, reason: "locked category" });
      continue;
    }
    const current = cat.budgetMonthly;
    const { value, clamped } = guided
      ? { value: Math.max(0, Math.round(s.monthly / 50) * 50), clamped: false }
      : clampChange(current, s.monthly, MAX_CHANGE_PCT);
    if (current != null && value === Math.round(current)) {
      unchanged++;
      continue;
    }
    sets.push({
      ...s,
      categoryId: cat.id,
      name: cat.name,
      monthly: value,
      current,
      median: cat.medianMonthlySpend,
      aiMonthly: s.monthly,
      clamped,
    });
  }

  return {
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.map(String) : [],
    sets,
    guided,
    baselineCycles: ctx.baselineCycles,
    oneOffs: ctx.oneOffs,
    dropped,
    unchanged,
    newCategories: Array.isArray(parsed.newCategories)
      ? parsed.newCategories
          .filter((n) => n && typeof n.name === "string" && typeof n.monthly === "number")
          .map((n) => ({
            name: n.name,
            color: typeof n.color === "string" ? n.color : "#6f926f",
            monthly: Math.round(n.monthly),
            rationale: typeof n.rationale === "string" ? n.rationale : "",
          }))
      : [],
  };
}

/**
 * Persist a proposal. Skips categories stamped budgetSource='manual', creates
 * genuinely new categories, and stamps every AI-set budget with
 * budgetSource='ai'. Emits an action per decision via `onLog`.
 */
export async function applyBudgetProposal(
  proposal: BudgetProposal,
  onLog?: (action: ApplyAction) => void
): Promise<ApplyAction[]> {
  const actions: ApplyAction[] = [];
  const emit = (a: ApplyAction) => {
    actions.push(a);
    onLog?.(a);
  };

  const cats = await db.select().from(categories);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));

  for (const s of proposal.sets) {
    const existing = s.categoryId != null ? byId.get(s.categoryId) : byName.get(s.name.toLowerCase());
    if (!existing) {
      // Unknown category referenced in sets — treat as a new-category request.
      emit({ kind: "skip", name: s.name, reason: "unknown category" });
      continue;
    }
    if (isLocked(existing.name)) {
      emit({ kind: "skip", name: existing.name, reason: "locked category" });
      continue;
    }
    if (existing.budgetSource === "manual") {
      emit({ kind: "skip", name: existing.name, reason: "manual budget" });
      continue;
    }
    await db
      .update(categories)
      .set({
        budgetMonthly: String(s.monthly),
        budgetWeekly: s.weekly != null ? String(s.weekly) : existing.budgetWeekly,
        budgetSource: "ai",
      })
      .where(eq(categories.id, existing.id));
    emit({ kind: "set", name: existing.name, monthly: s.monthly, reason: s.rationale });
  }

  for (const n of proposal.newCategories) {
    if (byName.has(n.name.toLowerCase())) {
      emit({ kind: "skip", name: n.name, reason: "already exists" });
      continue;
    }
    await db.insert(categories).values({
      name: n.name,
      color: n.color ?? "#6f926f",
      budgetMonthly: String(n.monthly),
      budgetSource: "ai",
      sort: 100,
    });
    emit({ kind: "new", name: n.name, monthly: n.monthly, reason: n.rationale });
  }

  return actions;
}
