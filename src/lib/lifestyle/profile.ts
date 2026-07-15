/**
 * Phase 6 — Lifestyle Extras.
 *
 * Hardcoded personal profile + prompt builders for the month-ahead event
 * scout. This is a single-user personal app, so the profile lives in code
 * (not a DB table, not agent memory). Edit here to retune the taste.
 */

// ─── Enums (shared with events.ts validation + schema) ─────────────────────
export const EVENT_TAGS = [
  "techno",
  "rave",
  "metal",
  "market",
  "minerals",
  "noise",
  "gaming",
  "gym",
  "misc",
] as const;
export type EventTag = (typeof EVENT_TAGS)[number];

export const AUDIENCES = ["me", "date", "both"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const PRICE_LEVELS = ["free", "cheap", "moderate"] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];

// ─── The person ────────────────────────────────────────────────────────────
export const PROFILE = [
  "The user is a 25-year-old man living at Responsgatan 36, 129 xx Hägersten, Stockholm, Sweden.",
  "He works office hours, roughly 08:00–17:00 Monday–Friday, so weekday evenings only free from ~18:00 and weekends fully free.",
  "Solo interests: techno and raves, live metal / hard rock / punk gigs, second-hand & flea markets (loppis, vintage, record fairs), gaming and geek culture (Pokémon Go community days, board-game cafés, retro/arcade, cosplay, anime/game conventions), and the gym / climbing.",
  "He has a girlfriend he goes on dates with. Her tastes: rocks, minerals, crystals, gems and fossils (mineral shows, gem fairs, geology exhibitions), plus noise / industrial / experimental / alternative music.",
  "Budget-aware: mostly free or cheap outings, with the occasional moderate splurge. Prefers variety and genuinely interesting, off-the-beaten-path events over generic tourist stuff.",
].join("\n");

// ─── Themes fanned out as parallel grounded searches ───────────────────────
export interface Theme {
  key: EventTag;
  label: string;
  audience: Audience;
  hint: string;
}

export const THEMES: Theme[] = [
  {
    key: "techno",
    label: "Techno & raves",
    audience: "me",
    hint: "techno club nights, raves, warehouse parties, electronic / house DJ events",
  },
  {
    key: "metal",
    label: "Metal & rock gigs",
    audience: "me",
    hint: "metal, hard rock, punk and hardcore live concerts and gigs",
  },
  {
    key: "market",
    label: "Second-hand & flea markets",
    audience: "me",
    hint: "loppis, flea markets, second-hand / vintage markets, record and comic fairs",
  },
  {
    key: "minerals",
    label: "Mineral, rock & gem fairs",
    audience: "date",
    hint: "mineral shows, rock / gem / crystal fairs, geology and fossil exhibitions (great for the girlfriend)",
  },
  {
    key: "noise",
    label: "Noise & experimental gigs",
    audience: "date",
    hint: "noise, industrial, experimental, avant-garde and alternative music nights (girlfriend date material)",
  },
  {
    key: "gaming",
    label: "Gaming, Pokémon Go & geek",
    audience: "me",
    hint: "gaming meetups, Pokémon Go community days, board-game cafés, retro/arcade nights, cosplay, anime/game conventions",
  },
  {
    key: "misc",
    label: "Cheap things to do",
    audience: "both",
    hint: "cheap or free things to do in Stockholm: pop-up exhibitions, sauna sessions, city hikes, climbing/gym day passes, food and street events",
  },
];

/**
 * Free-text grounded-search prompt for one theme. Instructs the model to hunt
 * for REAL, in-window events and print a direct URL for each.
 */
export function buildThemePrompt(
  theme: Theme,
  from: string,
  to: string,
  budgetHint: string
): string {
  return [
    `You are a local Stockholm culture scout. Search the web for REAL, currently-scheduled events in the "${theme.label}" category.`,
    `Focus: ${theme.hint}.`,
    `Location: Stockholm, Sweden and areas easily reachable by public transport from Hägersten (Responsgatan 36, 129 xx).`,
    `Date window: only events happening between ${from} and ${to} (the next ~4 weeks). Ignore anything outside this window.`,
    "",
    "Hard rules:",
    "- PRIORITISE Saturday and Sunday events.",
    "- Weekday (Mon–Fri) events are ONLY acceptable if they START at 18:00 or later — the user works 08:00–17:00.",
    `- Budget context: ${budgetHint}. Favour free and cheap events; only a few moderate ones.`,
    "- Only include events you can back with a real, working source URL. Never invent events or links.",
    "",
    "For EACH event write a short block containing: the event name, the exact date and start time, the venue, the price (or \"free\"), a one-line description, and the DIRECT event or ticket URL on its own line.",
    "List as many distinct, real events as you can find in this window (aim for 8–12).",
  ].join("\n");
}

/**
 * System instruction for the JSON structuring pass (SDK JSON mode — no tools,
 * so it never collides with grounding).
 */
export const STRUCTURE_PROMPT = [
  "You convert raw event notes into structured JSON. Return JSON only, no prose:",
  '{ "events": [ { "title": string, "url": string, "description": string, "tag": string, "audience": "me"|"date"|"both", "whenText": string, "eventDate": string|null, "price": string|null, "priceLevel": "free"|"cheap"|"moderate" } ] }',
  "",
  "RULES:",
  `- tag ∈ ${EVENT_TAGS.join("|")}. Pick the closest single tag.`,
  "- audience: 'date' = suits a partner who loves rocks/minerals and noise/alternative music; 'me' = solo interests (techno, metal, markets, gaming, gym); 'both' = works either way.",
  "- whenText = short human string like 'Sat 26 Jul · 20:00'. eventDate = ISO YYYY-MM-DD of the event (null only if genuinely unknown).",
  "- DROP any weekday (Mon–Fri) event that starts before 18:00. KEEP all weekend events.",
  "- url MUST be the direct, permanent event or venue page URL. NEVER use Google search redirect URLs, grounding redirect URLs, or any URL containing 'vertexaisearch' or 'google.com/search'. If you only have a redirect URL, use the venue's main website instead.",
  "- DROP events with no usable direct URL.",
  "- price = short string ('Free', '150 kr', '~200 kr'). priceLevel: free = 0 kr, cheap = ≤150 kr, moderate = >150 kr.",
  "- description = 2 tight sentences max. No markdown, no emoji, no bullet glyphs.",
  "- Deduplicate. Return every valid distinct event you find (up to 40).",
].join("\n");
