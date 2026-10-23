import type { StructuredEvent } from "./events";

/**
 * Pokémon GO in-game events from Leek Duck, via the ScrapedDuck JSON mirror.
 * Deterministic (no AI): exact dates, direct links and a thumbnail per event.
 *
 * Terms (github.com/bigfoott/ScrapedDuck): no paywall, no ads, credit
 * ScrapedDuck + LeekDuck.com (credit line on /weekend). GitHub caches the raw
 * file for 5 minutes; we read it once per scout run.
 */

const FEED_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json";
const FEED_TIMEOUT_MS = 10_000;
const TZ = "Europe/Stockholm";
const WEEKNIGHT_START_HOUR = 18;
const SEASONAL = /halloween|christmas|holiday|winter|new year|valentine|easter|lunar new year/i;

// Long rotations and non-outing noise. A denylist (not an allowlist) so new
// Leek Duck event types show up by default.
const SKIP_TYPES = new Set([
  "raid-battles",
  "go-battle-league",
  "go-pass",
  "season",
  "twitch-drops",
  "research",
  "max-mondays",
]);

// City-bound events: only keep the global or Stockholm/Sweden editions.
const LOCATION_BOUND = /night out|city safari|wild area|go tour|go fest|safari zone/i;
const LOCAL_OR_GLOBAL = /global|stockholm|sweden|sverige/i;

interface LeekEvent {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string;
  image: string | null;
  start: string | null;
  end: string | null;
  extraData?: {
    spotlight?: { bonus?: string; canBeShiny?: boolean };
    communityday?: { bonuses?: Array<{ text: string }> };
    raidbattles?: { bosses?: Array<{ name: string }> };
  } | null;
}

interface LocalTime {
  date: string; // YYYY-MM-DD in Stockholm
  hour: number;
  minute: number;
}

/**
 * Times ending in "Z" are global UTC moments; convert them to Stockholm.
 * Times without "Z" are already in the player's local time; read them as-is.
 */
function toLocal(iso: string): LocalTime | null {
  if (iso.endsWith("Z")) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      hour: Number(get("hour")) % 24,
      minute: Number(get("minute")),
    };
  }
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? { date: m[1], hour: Number(m[2]), minute: Number(m[3]) } : null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const hhmm = (t: LocalTime) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;

/** First Sat/Sun inside [from, to], else `from`, so multi-day events sort and filter as weekend plans. */
function pickDate(from: string, to: string): string {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = weekday(d);
    if (w === 0 || w === 6) return d;
  }
  return from;
}

function describe(e: LeekEvent): string {
  const x = e.extraData ?? {};
  const parts: string[] = [/^pok[eé]mon/i.test(e.heading) ? `${e.heading}.` : `Pokémon GO ${e.heading}.`];
  if (x.spotlight?.bonus) {
    parts.push(`Bonus: ${x.spotlight.bonus}${x.spotlight.canBeShiny ? ", shiny available" : ""}.`);
  }
  const bonuses = x.communityday?.bonuses?.slice(0, 3).map((b) => b.text);
  if (bonuses?.length) parts.push(`Bonuses: ${bonuses.join(", ")}.`);
  const bosses = x.raidbattles?.bosses?.map((b) => b.name);
  if (bosses?.length) parts.push(`Bosses: ${bosses.join(", ")}.`);
  return parts.join(" ");
}

/** In-window, Stockholm-relevant Pokémon GO events as scout events (tag pokemon, free, with image). */
export async function fetchPogoEvents(
  from: string,
  to: string,
  push: (line: string) => void
): Promise<StructuredEvent[]> {
  let feed: LeekEvent[];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    const res = await fetch(FEED_URL, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("feed is not an array");
    feed = data as LeekEvent[];
  } catch (e) {
    push(`[~]    Pokémon GO (Leek Duck): ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }

  const out: StructuredEvent[] = [];
  for (const e of feed) {
    if (!e?.name || !e.link || !e.start || !e.end) continue;
    if (SKIP_TYPES.has(e.eventType)) continue;
    if (LOCATION_BOUND.test(e.name) && !LOCAL_OR_GLOBAL.test(e.name)) continue;

    const start = toLocal(e.start);
    const end = toLocal(e.end);
    if (!start || !end) continue;
    if (end.date < from || start.date > to) continue; // no overlap with the window

    const singleDay = start.date === end.date;
    // Weeknight rule, applied to the END: a weekday event still running after
    // 18:00 (e.g. 18:00–19:00 Raid Hour) works after office hours.
    if (singleDay) {
      const w = weekday(start.date);
      const isWeekday = w >= 1 && w <= 5;
      if (isWeekday && end.hour < WEEKNIGHT_START_HOUR) continue;
    }

    const visibleFrom = start.date < from ? from : start.date;
    const visibleTo = end.date > to ? to : end.date;
    const whenText = singleDay
      ? `${dayLabel(start.date)} · ${hhmm(start)}–${hhmm(end)}`
      : `${dayLabel(start.date)} – ${dayLabel(end.date)}`;

    out.push({
      title: e.name.slice(0, 200),
      url: e.link,
      description: describe(e),
      tag: "pokemon",
      tags: SEASONAL.test(e.name) ? ["pokemon", "seasonal"] : ["pokemon"],
      audience: "me",
      whenText,
      eventDate: singleDay ? start.date : pickDate(visibleFrom, visibleTo),
      price: "Free",
      priceLevel: "free",
      imageUrl: e.image ?? null,
    });
  }

  push(`[OK]   Pokémon GO (Leek Duck): ${out.length} event(s) in window`);
  return out;
}
