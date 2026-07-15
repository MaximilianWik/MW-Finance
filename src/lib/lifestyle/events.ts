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
 * Two-step fetch (verified constraint): gemini-2.5-flash rejects
 * tools:[google_search] combined with responseMimeType:"application/json".
 * So we do grounded FREE-TEXT calls via raw REST (the installed
 * @google/generative-ai@0.21 SDK only exposes the legacy
 * googleSearchRetrieval tool, which 2.x models reject), then a SEPARATE
 * JSON-mode structuring call through the shared SDK factory.
 */

const WINDOW_DAYS = 30;
const MAX_EVENTS = 40;
const OG_CONCURRENCY = 8;
const OG_TIMEOUT_MS = 3000;

// ─── Types ─────────────────────────────────────────────────────────────────
interface StructuredEvent {
  title: string;
  url: string;
  description: string | null;
  tag: EventTag;
  audience: Audience;
  whenText: string | null;
  eventDate: string | null; // YYYY-MM-DD
  price: string | null;
  priceLevel: PriceLevel;
}

// ─── Step 1: grounded free-text search (raw REST) ──────────────────────────
async function searchTheme(
  theme: Theme,
  from: string,
  to: string,
  budgetHint: string
): Promise<{ text: string; urls: string[] }> {
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
    throw new Error(`grounded search (${theme.key}) ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
    }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const urls = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web?.uri)
    .filter((u): u is string => typeof u === "string");
  return { text, urls };
}

// ─── Step 2: JSON structuring (SDK JSON mode, no tools) ─────────────────────
async function structureEvents(
  mergedText: string,
  from: string,
  to: string
): Promise<StructuredEvent[]> {
  const model = geminiModel({ system: STRUCTURE_PROMPT, json: true, temperature: 0.3 });
  const prompt = [
    `Date window: ${from} to ${to}. Today is ${from}.`,
    "Structure the following raw event notes into JSON. Extract the direct URL for each event.",
    "",
    mergedText,
    "",
    "Produce the JSON now. JSON only.",
  ].join("\n");
  const res = await model.generateContent(prompt);
  const parsed = JSON.parse(res.response.text()) as { events?: unknown };
  const list = Array.isArray(parsed.events) ? parsed.events : [];

  const tagSet = new Set<string>(EVENT_TAGS);
  const audSet = new Set<string>(AUDIENCES);
  const lvlSet = new Set<string>(PRICE_LEVELS);

  const out: StructuredEvent[] = [];
  for (const raw of list as Array<Record<string, unknown>>) {
    if (!raw || typeof raw.title !== "string" || typeof raw.url !== "string") continue;
    if (!raw.title.trim() || !/^https?:\/\//i.test(raw.url)) continue;
    const eventDate =
      typeof raw.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.eventDate)
        ? raw.eventDate
        : null;
    out.push({
      title: raw.title.trim().slice(0, 200),
      url: raw.url.trim(),
      description: typeof raw.description === "string" ? raw.description.trim() : null,
      tag: tagSet.has(raw.tag as string) ? (raw.tag as EventTag) : "misc",
      audience: audSet.has(raw.audience as string) ? (raw.audience as Audience) : "both",
      whenText: typeof raw.whenText === "string" ? raw.whenText.trim() : null,
      eventDate,
      price: typeof raw.price === "string" ? raw.price.trim() : null,
      priceLevel: lvlSet.has(raw.priceLevel as string) ? (raw.priceLevel as PriceLevel) : "cheap",
    });
  }
  return out;
}

// ─── Dedupe (by url, then title+date) + cap ────────────────────────────────
function dedupe(events: StructuredEvent[], dismissedUrls: Set<string>): StructuredEvent[] {
  const seen = new Set<string>();
  const out: StructuredEvent[] = [];
  for (const e of events) {
    const uKey = e.url.toLowerCase();
    if (dismissedUrls.has(uKey)) continue; // don't resurface dismissed events
    const tKey = `${e.title.toLowerCase()}|${e.eventDate ?? ""}`;
    if (seen.has(uKey) || seen.has(tKey)) continue;
    seen.add(uKey);
    seen.add(tKey);
    out.push(e);
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

// ─── Best-effort og:image enrichment (8-concurrency, 3s timeout) ───────────
async function ogImage(pageUrl: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OG_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MWFinanceBot/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 120_000);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const src = m?.[1]?.trim();
    if (!src) return null;
    return src.startsWith("//") ? `https:${src}` : src;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichImages(events: StructuredEvent[]): Promise<(string | null)[]> {
  const images = new Array<string | null>(events.length).fill(null);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= events.length) return;
      images[i] = await ogImage(events[i].url);
    }
  }
  await Promise.all(Array.from({ length: OG_CONCURRENCY }, worker));
  return images;
}

// ─── Budget headroom hint ──────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeIsWeekend(eventDate: string | null): boolean {
  if (!eventDate) return false;
  const day = new Date(`${eventDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6; // Sun | Sat
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

  // Fan out all themes in parallel. A single failed theme must not kill the run.
  push(`[..]   searching ${THEMES.length} themes…`);
  const results = await Promise.all(
    THEMES.map((t) =>
      searchTheme(t, from, to, hint)
        .then((r) => {
          push(`[OK]   ${t.label}: ${r.urls.length} source(s)`);
          return r;
        })
        .catch((e) => {
          push(`[~]    ${t.label}: ${e instanceof Error ? e.message : String(e)}`);
          return { text: "", urls: [] as string[] };
        })
    )
  );

  const mergedText = results
    .map((r) => r.text)
    .filter(Boolean)
    .join("\n\n----\n\n");
  const groundedUrls = [...new Set(results.flatMap((r) => r.urls))];
  if (!mergedText.trim()) {
    push("[DONE] no event text returned from search");
    return { inserted: 0 };
  }

  push("[AI]   structuring events…");
  const structured = await structureEvents(
    `${mergedText}\n\nReference source URLs:\n${groundedUrls.join("\n")}`,
    from,
    to
  );
  push(`[OK]   model returned ${structured.length} event(s)`);

  // Don't resurface events the user already dismissed (any window).
  const dismissedRows = await db
    .select({ url: eventSuggestions.url })
    .from(eventSuggestions)
    .where(eq(eventSuggestions.dismissed, true));
  const dismissedUrls = new Set(dismissedRows.map((r) => r.url.toLowerCase()));

  const picked = dedupe(structured, dismissedUrls);
  push(`[..]   ${picked.length} after dedupe/cap`);

  if (picked.length === 0) {
    // Still clear the stale non-dismissed set.
    await db.delete(eventSuggestions).where(eq(eventSuggestions.dismissed, false));
    push("[DONE] nothing new to save");
    return { inserted: 0 };
  }

  push("[..]   fetching event images…");
  const images = await enrichImages(picked);
  push(`[OK]   ${images.filter(Boolean).length}/${picked.length} images resolved`);

  // Replace the current non-dismissed set with the fresh batch.
  await db.delete(eventSuggestions).where(eq(eventSuggestions.dismissed, false));

  const rows: NewEventSuggestion[] = picked.map((e, i) => ({
    title: e.title,
    url: e.url,
    description: e.description,
    tag: e.tag,
    audience: e.audience,
    whenText: e.whenText,
    eventDate: e.eventDate,
    isWeekend: computeIsWeekend(e.eventDate),
    price: e.price,
    priceLevel: e.priceLevel,
    imageUrl: images[i],
    windowStart: from,
  }));

  const inserted = await db.insert(eventSuggestions).values(rows).returning();
  const weekend = inserted.filter((r) => r.isWeekend).length;
  for (const r of inserted) {
    const flag = r.isWeekend ? "[W]" : "[·]";
    push(`       ${flag} ${r.whenText ?? "?"} — ${r.title}`);
  }
  push(`[DONE] ${inserted.length} event(s) saved (${weekend} weekend)`);

  await sendNtfy(`Monthly plans ready — ${inserted.length} things to do (${weekend} this weekend).`, {
    title: "MWFinance · Weekend",
    tags: ["calendar"],
    click: `${env.appUrl}/weekend`,
  });

  return { inserted: inserted.length };
}
