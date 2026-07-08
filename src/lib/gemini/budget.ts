import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { geminiModel } from "./client";
import { getFinancialContext, type FinancialContext } from "./context";

/**
 * AI budget setting / recalibration.
 *
 * The AI identifies income, spending habits, and recurring commitments, then
 * proposes a realistic monthly budget per category. Manual budgets are never
 * overwritten — the apply step skips any category stamped budgetSource='manual'.
 */

export interface BudgetSet {
  categoryId: number | null; // null = resolve by name (or a new category)
  name: string;
  monthly: number;
  weekly?: number | null;
  rationale: string;
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
  "- Base budgets on avg monthly spend, recurring commitments, and income. Round to clean figures (nearest 50 or 100 kr).",
  "- Total of all budgets must leave room for savings — do NOT let budgets exceed monthly income.",
  "- NEVER propose a change for a category whose source is 'manual'. Omit it from 'sets' entirely.",
  "- Only propose newCategories when the data clearly shows recurring spend that has no fitting existing category. Prefer reusing existing categories.",
  "- Do not budget the Income, Savings, Investments, Transfers, Swish or Uncategorized categories in 'sets'.",
  "- 'reasoning' = 3–6 short terminal-style lines explaining the logic. No markdown, no emoji.",
].join("\n");

function buildPrompt(ctx: FinancialContext): string {
  const catLines = ctx.categories.map(
    (c) =>
      `  { id: ${c.id}, name: "${c.name}", currentBudget: ${c.budgetMonthly ?? "null"}, avgMonthlySpend: ${c.avgMonthlySpend}, source: "${c.budgetSource ?? "none"}" }`
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
    "Categories:",
    ...catLines,
    "",
    "Recurring commitments:",
    ...(recurringLines.length ? recurringLines : ["  (none)"]),
    "",
    "Propose the budget now. JSON only.",
  ].join("\n");
}

/** Ask Gemini for a budget proposal. Pure — writes nothing. */
export async function proposeBudget(): Promise<BudgetProposal> {
  const ctx = await getFinancialContext();
  const model = geminiModel({ system: SYSTEM, json: true, temperature: 0.3 });
  const res = await model.generateContent(buildPrompt(ctx));
  const parsed = JSON.parse(res.response.text()) as Partial<BudgetProposal>;

  return {
    reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning.map(String) : [],
    sets: Array.isArray(parsed.sets)
      ? parsed.sets
          .filter((s) => s && typeof s.name === "string" && typeof s.monthly === "number")
          .map((s) => ({
            categoryId: typeof s.categoryId === "number" ? s.categoryId : null,
            name: s.name,
            monthly: Math.round(s.monthly),
            weekly: typeof s.weekly === "number" ? Math.round(s.weekly) : null,
            rationale: typeof s.rationale === "string" ? s.rationale : "",
          }))
      : [],
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

const PROTECTED = new Set(["Income", "Savings", "Investments", "Transfers", "Swish", "Uncategorized"]);

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
    if (PROTECTED.has(existing.name)) {
      emit({ kind: "skip", name: existing.name, reason: "protected category" });
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
