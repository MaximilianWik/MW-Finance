import { db } from "@/db";
import { eventSuggestions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { geminiModel } from "@/lib/gemini/client";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { sendNtfy } from "@/lib/notify";
import type { NewEventSuggestion } from "@/db/schema";
import {
  THEMES,
  PROFILE,
  STRUCTURE_PROMPT,
  buildThemePrompt,
  EVENT_TAGS,
  AUDIENCES,
  PRICE_LEVELS,
  type Theme,
  type EventTag,
  type Audience,
  type PriceLevel,
} from "./profile";

/**
 * Phase 6 event engine.
 *
 * Per theme, pipelined and in parallel:
 *   1. grounded FREE-TEXT search via raw REST (gemini rejects google_search
 *      combined with JSON mode, and the installed SDK only exposes the legacy
 *      retrieval tool), with grounding redirects resolved to real URLs;
 *   2. a SEPARATE JSON-mode structuring call, retried once, with a salvage
 *      parser for truncated / slightly broken JSON.
 * Then: validate (date window, weeknight 18:00 rule), dedupe across themes,
 * pick a balanced set (round-robin per theme), and give link-less events a
 * search link so every card is clickable and the row never has a null url.
 */

const WINDOW_DAYS = 30;
const MAX_EVENTS = 60;
const SEARCH_TIMEOUT_MS = 90_000;
const STRUCTURE_TIMEOUT_MS = 60_000;
const STRUCTURE_ATTEMPTS = 2;
const REDIRECT_RESOLVE_TIMEOUT_MS = 4_000;
const WEEKNIGHT_START_HOUR = 18;

// ─── Types ─────────────────────────────────────────────────────────────────
interface StructuredEvent {
  title: string;
  url: string | null;
  description: string | null;
  tag: EventTag;
  audience: Audience;
  whenText: string | null;
  eventDate: string | null; // YYYY-MM-DD
  price: string | null;
  priceLevel: PriceLevel;
}

interface Source {
  url: string;
  title?: string;
}

/**
 * Gemini's google_search grounding only returns temporary
 * `vertexaisearch.cloud.google.com` redirect links. Follow each redirect
 * server-side so the structuring step gets the real venue/ticket URL.
 */
async function resolveGroundingUrl(uri: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REDIRECT_RESOLVE_TIMEOUT_MS);
    const res = await fetch(uri, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const finalUrl = res.url;
    if (!finalUrl) return null;
    if (finalUrl.includes("vertexaisearch.cloud.google.com")) return null;
    if (finalUrl.includes("google.com/search")) return null;
    return finalUrl;
  } catch {
    return null; // timed out, network error, or blocked: skip this source
  }
}

// ─── Step 1: grounded free-text search (raw REST) ──────────────────────────
async function searchTheme(
  theme: Theme,
  from: string,
  to: string,
  budgetHint: string
): Promise<{ text: string; sources: Source[] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROFILE }] },
      contents: [{ role: "user", parts: [{ text: buildThemePrompt(theme, from, to, budgetHint) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.6 },
    }),
  });
  if (!res.ok) {
    throw new Error(`grounded search (${theme.key}) ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];

  // Each redirect is individually time-boxed, so slow hosts never stall the batch.
  const resolved = await Promise.all(
    chunks.map(async (c) => {
      const uri = c.web?.uri;
      if (!uri) return null;
      const real = await resolveGroundingUrl(uri);
      if (!real) return null;
      return { url: real, title: c.web?.title } as Source;
    })
  );
  const seen = new Set<string>();
  const sources = resolved.filter((s): s is Source => {
    if (!s || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  return { text, sources };
}

// ─── Step 2: JSON structuring (SDK JSON mode, no tools) ────────────────────

/** Normalize a model URL. Rejects grounding/search redirects (they expire). */
function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s === "#" || s.startsWith("javascript:")) return null;
  if (s.includes("vertexaisearch.cloud.google.com")) return null;
  if (s.includes("google.com/search")) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^[a-zA-Z0-9]/.test(s) && s.includes(".")) return `https://${s}`;
  return null;
}

/**
 * Parse the structuring output. Falls back to salvaging every complete
 * `{...}` object inside the events array, so one truncated or broken entry
 * no longer throws away the whole theme.
 */
function parseEvents(raw: string): unknown[] | null {
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(jsonStr) as { events?: unknown } | unknown[];
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    // fall through to salvage
  }

  const start = jsonStr.indexOf("[");
  if (start < 0) return null;
  const out: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = start + 1; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(jsonStr.slice(objStart, i + 1)));
        } catch {
          // skip this one broken object
        }
        objStart = -1;
      }
    }
  }
  return out.length ? out : null;
}

function toStructured(item: Record<string, unknown>, theme: Theme): StructuredEvent | null {
  if (!item || typeof item.title !== "string" || !item.title.trim()) return null;
  const tagSet = new Set<string>(EVENT_TAGS);
  const audSet = new Set<string>(AUDIENCES);
  const lvlSet = new Set<string>(PRICE_LEVELS);
  const eventDate =
    typeof item.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.eventDate) ? item.eventDate : null;
  return {
    title: item.title.trim().slice(0, 200),
    url: normalizeUrl(item.url),
    description: typeof item.description === "string" ? item.description.trim() : null,
    tag: tagSet.has(item.tag as string) ? (item.tag as EventTag) : theme.key,
    audience: audSet.has(item.audience as string) ? (item.audience as Audience) : theme.audience,
    whenText: typeof item.whenText === "string" ? item.whenText.trim() : null,
    eventDate,
    price: typeof item.price === "string" ? item.price.trim() : null,
    priceLevel: lvlSet.has(item.priceLevel as string) ? (item.priceLevel as PriceLevel) : "cheap",
  };
}

async function structureOnce(prompt: string): Promise<unknown[] | null> {
  const model = geminiModel({ system: STRUCTURE_PROMPT, json: true, temperature: 0.2 });
  const res = await withTimeout(model.generateContent(prompt), STRUCTURE_TIMEOUT_MS, "structuring");
  return parseEvents(res.response.text().trim());
}

async function structureTheme(
  text: string,
  sources: Source[],
  theme: Theme,
  from: string,
  to: string,
  push: (line: string) => void
): Promise<StructuredEvent[]> {
  if (!text.trim()) {
    push(`[~]    ${theme.label}: search returned no text`);
    return [];
  }
  const refLines = sources.map((s) => (s.title ? `- ${s.title}: ${s.url}` : `- ${s.url}`));
  const prompt = [
    `Date window: ${from} to ${to}. Today is ${from}.`,
    `Theme: ${theme.label}. Default audience hint: "${theme.audience}" (override per event if clearer).`,
    "Structure the following raw event notes into JSON. Match each event to a direct URL below if one clearly corresponds, otherwise use a URL written in the notes, otherwise null.",
    refLines.length ? `Reference source URLs (real, resolved links):\n${refLines.join("\n")}` : "",
    "",
    text.slice(0, 8_000),
    "",
    "Produce the JSON now. JSON only.",
  ].join("\n");

  let list: unknown[] | null = null;
  for (let attempt = 1; attempt <= STRUCTURE_ATTEMPTS && list === null; attempt++) {
    try {
      list = await structureOnce(prompt);
      if (list === null) push(`[~]    ${theme.label}: unreadable JSON (attempt ${attempt})`);
    } catch (e) {
      push(`[~]    ${theme.label}: ${e instanceof Error ? e.message : String(e)} (attempt ${attempt})`);
    }
  }
  if (list === null) return [];

  const out: StructuredEvent[] = [];
  for (const item of list as Array<Record<string, unknown>>) {
    const e = toStructured(item, theme);
    if (e) out.push(e);
  }
  const noUrl = out.filter((e) => !e.url).length;
  push(`[OK]   ${theme.label}: ${out.length} event(s)${noUrl ? `, ${noUrl} without a direct link` : ""}`);
  return out;
}

// ─── Validation ────────────────────────────────────────────────────────────
function weekday(eventDate: string): number {
  return new Date(`${eventDate}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
}

function computeIsWeekend(eventDate: string | null): boolean {
  if (!eventDate) return false;
  const d = weekday(eventDate);
  return d === 0 || d === 6;
}

/** Start hour from strings like "Fri 30 Oct · 19:00" or "kl 18.30"; null if none. */
function startHour(whenText: string | null): number | null {
  const m = whenText?.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return m ? Number(m[1]) : null;
}

/** Keep only events inside the window that respect the weeknight 18:00 rule. */
function validate(e: StructuredEvent, from: string, to: string): string | null {
  if (e.eventDate && (e.eventDate < from || e.eventDate > to)) return "outside window";
  if (e.eventDate && !computeIsWeekend(e.eventDate)) {
    const h = startHour(e.whenText);
    if (h !== null && h < WEEKNIGHT_START_HOUR) return "weekday before 18:00";
  }
  return null;
}

// ─── Dedupe + balanced pick ────────────────────────────────────────────────
function titleKey(title: string, eventDate: string | null): string {
  const t = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  return `${t}|${eventDate ?? ""}`;
}

/**
 * Round-robin across themes (each theme sorted weekend-first, then by date)
 * so one chatty theme can't fill the cap. Cross-theme duplicates are dropped
 * by URL or normalized title+date; the copy with a direct URL wins.
 */
function pickBalanced(
  byTheme: StructuredEvent[][],
  dismissed: { urls: Set<string>; titles: Set<string> }
): StructuredEvent[] {
  const best = new Map<string, StructuredEvent>();
  for (const list of byTheme) {
    for (const e of list) {
      const k = titleKey(e.title, e.eventDate);
      const prev = best.get(k);
      if (!prev || (!prev.url && e.url)) best.set(k, e);
    }
  }

  const sortKey = (e: StructuredEvent) => `${computeIsWeekend(e.eventDate) ? 0 : 1}|${e.eventDate ?? "9999"}`;
  const queues = byTheme.map((list) =>
    list
      .filter((e) => best.get(titleKey(e.title, e.eventDate)) === e)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  );

  const seenUrls = new Set<string>();
  const out: StructuredEvent[] = [];
  let progressed = true;
  while (out.length < MAX_EVENTS && progressed) {
    progressed = false;
    for (const q of queues) {
      const e = q.shift();
      if (!e) continue;
      progressed = true;
      const u = e.url?.toLowerCase();
      if (u && (dismissed.urls.has(u) || seenUrls.has(u))) continue;
      if (dismissed.titles.has(titleKey(e.title, e.eventDate))) continue;
      if (u) seenUrls.add(u);
      out.push(e);
      if (out.length >= MAX_EVENTS) break;
    }
  }
  return out;
}

/** Search link for events without a direct URL, so every card opens something. */
function searchUrl(e: StructuredEvent): string {
  const q = [e.title, e.eventDate ?? e.whenText ?? "", "Stockholm"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function budgetHint(): Promise<string> {
  try {
    const b = await getMonthlyBudgetStatus();
    const pick = (n: string) => b.rows.find((r) => r.name.toLowerCase() === n);
    const parts: string[] = [];
    const ent = pick("entertainment");
    const rest = pick("restaurants");
    if (ent?.remaining != null) parts.push(`Entertainment budget: ~${Math.round(ent.remaining)} kr left this cycle`);
    if (rest?.remaining != null) parts.push(`Restaurants budget: ~${Math.round(rest.remaining)} kr left this cycle`);
    return parts.length ? parts.join("; ") : "keep it mostly free or cheap";
  } catch {
    return "keep it mostly free or cheap";
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Orchestrator ──────────────────────────────────────────────────────────
export async function runEventSuggestions(
  onLog?: (line: string) => void
): Promise<{ inserted: number }> {
  const push = (l: string) => onLog?.(l);

  const now = new Date();
  const from = isoDate(now);
  const to = isoDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000));

  push(`[AI]   scouting Stockholm events ${from} → ${to}`);
  const hint = await budgetHint();
  push(`[..]   ${hint}`);
  push(`[..]   searching & structuring ${THEMES.length} themes in parallel…`);

  // Search and structuring have separate deadlines (worst case 90s + 2×60s),
  // inside the route's maxDuration of 300s.
  const byTheme = await Promise.all(
    THEMES.map(async (t) => {
      const t0 = Date.now();
      let search: { text: string; sources: Source[] };
      try {
        search = await withTimeout(searchTheme(t, from, to, hint), SEARCH_TIMEOUT_MS, `${t.label} search`);
      } catch (e) {
        push(`[~]    ${t.label}: ${e instanceof Error ? e.message : String(e)}`);
        return [] as StructuredEvent[];
      }
      push(`[..]   ${t.label}: ${search.sources.length} source(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      const list = await structureTheme(search.text, search.sources, t, from, to, push);

      const kept: StructuredEvent[] = [];
      const reasons = new Map<string, number>();
      for (const e of list) {
        const why = validate(e, from, to);
        if (why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
        else kept.push(e);
      }
      if (reasons.size) {
        const r = [...reasons].map(([k, n]) => `${n} ${k}`).join(", ");
        push(`[~]    ${t.label}: dropped ${r}`);
      }
      return kept;
    })
  );

  const total = byTheme.reduce((s, l) => s + l.length, 0);
  if (total === 0) {
    push("[DONE] no events returned from any theme (kept the current list)");
    return { inserted: 0 };
  }
  push(`[OK]   ${total} valid event(s) across all themes`);

  // Don't resurface events the user already dismissed (any window).
  const dismissedRows = await db
    .select({ url: eventSuggestions.url, title: eventSuggestions.title, eventDate: eventSuggestions.eventDate })
    .from(eventSuggestions)
    .where(eq(eventSuggestions.dismissed, true));
  const dismissed = {
    urls: new Set(dismissedRows.map((r) => r.url?.toLowerCase()).filter((u): u is string => !!u)),
    titles: new Set(dismissedRows.map((r) => titleKey(r.title, r.eventDate))),
  };

  const picked = pickBalanced(byTheme, dismissed);
  push(`[..]   ${picked.length} after dedupe / balance (cap ${MAX_EVENTS})`);
  if (picked.length === 0) {
    push("[DONE] nothing new to save (kept the current list)");
    return { inserted: 0 };
  }

  const rows: NewEventSuggestion[] = picked.map((e) => ({
    title: e.title,
    url: e.url ?? searchUrl(e),
    description: e.description,
    tag: e.tag,
    audience: e.audience,
    whenText: e.whenText,
    eventDate: e.eventDate,
    isWeekend: computeIsWeekend(e.eventDate),
    price: e.price,
    priceLevel: e.priceLevel,
    imageUrl: null, // ASCII fallback in the UI
    windowStart: from,
  }));

  // Replace the non-dismissed set only once the fresh batch is ready. neon-http
  // has no interactive transactions; db.batch runs both statements atomically,
  // so a failed insert never leaves the page empty.
  const [, inserted] = await db.batch([
    db.delete(eventSuggestions).where(eq(eventSuggestions.dismissed, false)),
    db.insert(eventSuggestions).values(rows).returning(),
  ]);

  const weekend = inserted.filter((r) => r.isWeekend).length;
  for (const r of inserted) {
    push(`       ${r.isWeekend ? "[W]" : "[·]"} ${r.whenText ?? "?"} · ${r.title}`);
  }
  push(`[DONE] ${inserted.length} event(s) saved (${weekend} weekend)`);

  await sendNtfy(`Monthly plans ready: ${inserted.length} things to do (${weekend} on weekends).`, {
    title: "MWFinance · Weekend",
    tags: ["calendar"],
    click: `${env.appUrl}/weekend`,
  });

  return { inserted: inserted.length };
}
