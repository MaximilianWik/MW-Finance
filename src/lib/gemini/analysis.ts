import { db } from "@/db";
import { categories, aiInsights } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { geminiModel } from "./client";
import { getFinancialContext, formatContext } from "./context";
import type { AiInsight } from "@/db/schema";

/**
 * Behavioral analysis batch (nightly cron + manual trigger).
 *
 * Feeds the financial context to Gemini and asks for harmful spending
 * patterns, concrete savings suggestions, and notable trends. Results are
 * persisted to `ai_insights` for surfacing on the dashboard / insights page.
 */

export type InsightKind = "pattern" | "suggestion" | "trend";
export type InsightSeverity = "info" | "warn" | "danger";

const GENERATED_KINDS: InsightKind[] = ["pattern", "suggestion", "trend"];

interface RawInsight {
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  categoryName?: string | null;
}

const SYSTEM = [
  "You are the MWFinance behavior analyst. From the user's financial context, surface the few things that actually matter.",
  "Return JSON only:",
  '{ "insights": [{ "kind": "pattern"|"suggestion"|"trend", "severity": "info"|"warn"|"danger", "title": string, "body": string, "categoryName": string|null }] }',
  "",
  "RULES:",
  "- Max 6 insights. Quality over quantity — skip the obvious.",
  "- 'pattern' = a harmful or notable spending habit. 'suggestion' = a concrete, actionable savings move. 'trend' = a meaningful directional change.",
  "- severity: 'danger' = overspending / at-risk goal, 'warn' = drifting, 'info' = neutral/positive.",
  "- title = <=6 words, terminal voice. body = 1-2 short lines, name real kr figures from the context. No markdown, no emoji, no bullet glyphs.",
  "- categoryName must exactly match a category in the context, or be null.",
  "- If nothing noteworthy, return an empty insights array.",
].join("\n");

/** Ask Gemini for insights. Pure — writes nothing. */
export async function analyzeBehavior(): Promise<RawInsight[]> {
  const ctx = await getFinancialContext();
  const model = geminiModel({ system: SYSTEM, json: true, temperature: 0.5 });
  const res = await model.generateContent(formatContext(ctx) + "\n\nProduce the insights now. JSON only.");
  const parsed = JSON.parse(res.response.text()) as { insights?: unknown };
  const list = Array.isArray(parsed.insights) ? parsed.insights : [];

  const validKind = new Set(GENERATED_KINDS);
  const validSev = new Set<InsightSeverity>(["info", "warn", "danger"]);
  const out: RawInsight[] = [];
  for (const raw of list as RawInsight[]) {
    if (!raw || typeof raw.title !== "string" || typeof raw.body !== "string") continue;
    if (!validKind.has(raw.kind)) continue;
    out.push({
      kind: raw.kind,
      severity: validSev.has(raw.severity) ? raw.severity : "info",
      title: raw.title,
      body: raw.body,
      categoryName: typeof raw.categoryName === "string" ? raw.categoryName : null,
    });
  }
  return out;
}

/**
 * Run analysis and replace the current non-dismissed generated insights with a
 * fresh set. Anomaly insights (written by the suspicious-payment layer) are
 * left untouched. Emits a log line per insight via `onLog`.
 */
export async function runBehaviorAnalysis(
  onLog?: (line: string) => void
): Promise<AiInsight[]> {
  const push = (l: string) => onLog?.(l);

  push("[AI]   analyzing spending behavior…");
  const insights = await analyzeBehavior();
  push(`[OK]   model returned ${insights.length} insight(s)`);

  // Resolve category names → ids.
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const nameToId = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  // Clear the previous generated (non-dismissed) insights so the set stays fresh.
  await db
    .delete(aiInsights)
    .where(and(eq(aiInsights.dismissed, false), inArray(aiInsights.kind, GENERATED_KINDS)));

  if (insights.length === 0) {
    push("[DONE] no noteworthy insights this run");
    return [];
  }

  const rows = insights.map((i) => ({
    kind: i.kind,
    severity: i.severity,
    title: i.title,
    body: i.body,
    categoryId: i.categoryName ? nameToId.get(i.categoryName.toLowerCase()) ?? null : null,
  }));

  const inserted = await db.insert(aiInsights).values(rows).returning();
  for (const i of inserted) {
    const tag = i.severity === "danger" ? "[!]" : i.severity === "warn" ? "[~]" : "[✓]";
    push(`       ${tag} ${i.title}`);
  }
  push(`[DONE] ${inserted.length} insight(s) saved`);
  return inserted;
}
