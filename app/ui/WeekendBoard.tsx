"use client";

import { useMemo, useState } from "react";
import { EventCard, eventTags, type EventCardData } from "./EventCard";

/**
 * Client-side filter bar + grouped grid for /weekend. All filtering is local
 * (the page already holds the whole ≤60-event batch), so it is instant.
 */

type When = "all" | "thisWeekend" | "nextWeekend" | "next7" | "weeknights";
type Price = "any" | "free" | "cheap" | "moderate";
type With = "any" | "me" | "date";

const WHEN_OPTS: Array<[When, string]> = [
  ["all", "all"],
  ["thisWeekend", "this weekend"],
  ["nextWeekend", "next weekend"],
  ["next7", "next 7 days"],
  ["weeknights", "weeknights"],
];
const PRICE_OPTS: Array<[Price, string]> = [
  ["any", "any"],
  ["free", "free"],
  ["cheap", "≤ cheap"],
  ["moderate", "moderate"],
];
const WITH_OPTS: Array<[With, string]> = [
  ["any", "any"],
  ["me", "solo"],
  ["date", "date"],
];

/** Today as YYYY-MM-DD in Stockholm time (not UTC, not the browser's zone). */
function stockholmToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Saturday + Sunday of the current weekend (today counts if it is Sat/Sun). */
function weekendRange(today: string, weeksAhead: number): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const sat = dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow);
  const start = addDays(sat, 7 * weeksAhead);
  return [start, addDays(start, 1)];
}

function matchesWhen(e: EventCardData, when: When, today: string): boolean {
  if (when === "all") return true;
  if (when === "weeknights") return !e.isWeekend;
  if (!e.eventDate) return false;
  if (when === "next7") return e.eventDate >= today && e.eventDate <= addDays(today, 6);
  const [from, to] = weekendRange(today, when === "nextWeekend" ? 1 : 0);
  return e.eventDate >= from && e.eventDate <= to;
}

function matchesPrice(e: EventCardData, price: Price): boolean {
  if (price === "any") return true;
  const lvl = e.priceLevel ?? "cheap";
  if (price === "cheap") return lvl === "free" || lvl === "cheap";
  return lvl === price;
}

function matchesWith(e: EventCardData, w: With): boolean {
  if (w === "any") return true;
  return e.audience === w || e.audience === "both" || !e.audience;
}

function Chips<T extends string>({
  label,
  opts,
  value,
  onChange,
}: {
  label: string;
  opts: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-faint">--{label}</span>
      {opts.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={"tag transition-colors hover:text-accent " + (value === v ? "tag-accent" : "tag-muted")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function SectionGrid({ title, events }: { title: string; events: EventCardData[] }) {
  if (events.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[0.7rem] uppercase tracking-term text-faint">
        ▸ {title} <span className="text-muted">· {events.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </section>
  );
}

export function WeekendBoard({ events }: { events: EventCardData[] }) {
  const [when, setWhen] = useState<When>("all");
  const [price, setPrice] = useState<Price>("any");
  const [withWho, setWithWho] = useState<With>("any");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const today = stockholmToday();

  // Category chips: only tags present in this batch, with counts.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      for (const t of eventTags(e)) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const needle = q.trim().toLowerCase();
  const shown = events.filter(
    (e) =>
      matchesWhen(e, when, today) &&
      matchesPrice(e, price) &&
      matchesWith(e, withWho) &&
      (tags.size === 0 || eventTags(e).some((t) => tags.has(t))) &&
      (!needle || `${e.title} ${e.description ?? ""}`.toLowerCase().includes(needle))
  );

  const filtered = when !== "all" || price !== "any" || withWho !== "any" || tags.size > 0 || !!needle;

  function toggleTag(t: string) {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function clear() {
    setWhen("all");
    setPrice("any");
    setWithWho("any");
    setTags(new Set());
    setQ("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border border-edge bg-panel px-3 py-2.5 text-[0.65rem] uppercase tracking-term">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-accent">$ filter</span>
          <span className="text-faint">
            {shown.length} / {events.length} shown
            {filtered && (
              <button type="button" onClick={clear} className="ml-3 text-muted hover:text-danger">
                [ clear ]
              </button>
            )}
          </span>
        </div>
        <Chips label="when" opts={WHEN_OPTS} value={when} onChange={setWhen} />
        <Chips label="price" opts={PRICE_OPTS} value={price} onChange={setPrice} />
        <Chips label="with" opts={WITH_OPTS} value={withWho} onChange={setWithWho} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-faint">--cat</span>
          {tagCounts.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={"tag transition-colors hover:text-accent " + (tags.has(t) ? "tag-accent" : "tag-muted")}
            >
              {t} <span className="ml-1 text-faint">{n}</span>
            </button>
          ))}
        </div>
        <label className="prompt mt-1 normal-case tracking-normal">
          <span className="sigil">--search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title / description" />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="border border-edge bg-panel px-4 py-8 text-center text-sm text-muted">
          No plans match these filters.
        </p>
      ) : (
        <>
          <SectionGrid title="WEEKEND PICKS" events={shown.filter((e) => e.isWeekend)} />
          <SectionGrid title="AFTER-WORK / WEEKNIGHTS" events={shown.filter((e) => !e.isWeekend)} />
        </>
      )}
    </div>
  );
}
