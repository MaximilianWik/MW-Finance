import { db } from "@/db";
import { eventSuggestions } from "@/db/schema";
import { and, eq, or, gte, isNull, asc } from "drizzle-orm";
import { Panel } from "../ui/Panel";
import { AiConsole } from "../ui/AiConsole";
import { AsciiSigil } from "../ui/AsciiSigil";
import { EventCard, type EventCardData } from "../ui/EventCard";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

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

export default async function WeekendPage() {
  const today = new Date().toISOString().slice(0, 10);

  const t0 = Date.now();
  const [rows, queryLog] = await withQueryLog(async () => {
    return await db
      .select({
        id: eventSuggestions.id,
        title: eventSuggestions.title,
        url: eventSuggestions.url,
        description: eventSuggestions.description,
        tag: eventSuggestions.tag,
        audience: eventSuggestions.audience,
        whenText: eventSuggestions.whenText,
        isWeekend: eventSuggestions.isWeekend,
        price: eventSuggestions.price,
        priceLevel: eventSuggestions.priceLevel,
        imageUrl: eventSuggestions.imageUrl,
        eventDate: eventSuggestions.eventDate,
      })
      .from(eventSuggestions)
      .where(
        and(
          eq(eventSuggestions.dismissed, false),
          or(gte(eventSuggestions.eventDate, today), isNull(eventSuggestions.eventDate))
        )
      )
      // NULLS LAST by Postgres default on ASC → dated events first, undated trail.
      .orderBy(asc(eventSuggestions.eventDate), asc(eventSuggestions.id));
  });
  const tookMs = Date.now() - t0;

  const events: EventCardData[] = rows;
  const weekend = events.filter((e) => e.isWeekend);
  const weeknight = events.filter((e) => !e.isWeekend);

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="WEEKEND" />

      <Panel title="WEEKEND & EXTRAS" right={events.length > 0 ? `${events.length} PLANS` : undefined}>
        <p className="mb-3 text-[0.7rem] leading-relaxed text-muted">
          AI-scouted things to do around Stockholm for the next ~30 days — weekends first,
          weeknights only after 18:00. Budget-aware, refreshed weekly.
        </p>
        <AiConsole
          endpoint="/api/lifestyle/run"
          label="$ find things to do"
          pendingLabel="scouting…"
        />
      </Panel>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <AsciiSigil name="wingedSpine" tone="accent" opacity={0.16} className="text-[0.55rem]" />
          <p className="text-center text-sm text-muted">
            No plans yet. Hit <span className="text-accent">$ find things to do</span> to scout the month.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <SectionGrid title="WEEKEND PICKS" events={weekend} />
          <SectionGrid title="AFTER-WORK / WEEKNIGHTS" events={weeknight} />
        </div>
      )}
    </main>
  );
}
