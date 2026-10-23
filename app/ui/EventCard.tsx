"use client";

import { useState } from "react";
import { AsciiSigil } from "./AsciiSigil";
import { dismissEvent } from "../actions";

export interface EventCardData {
  id: number;
  title: string;
  url: string | null;
  description: string | null;
  tag: string | null;
  audience: string | null;
  whenText: string | null;
  isWeekend: boolean;
  price: string | null;
  priceLevel: string | null;
  imageUrl: string | null;
  eventDate: string | null; // YYYY-MM-DD, used by the /weekend filters
}

function priceClass(level: string | null): string {
  if (level === "free") return "text-ok";
  if (level === "moderate") return "text-amber";
  return "text-accent"; // cheap / unknown
}

/** Main amount only: "250 SEK (150 SEK for members…)" → "250 SEK". Full text stays in the tooltip. */
function shortPrice(price: string): string {
  return price.replace(/\s*[(\[].*$/, "").trim() || price;
}

function audienceLabel(a: string | null): string | null {
  if (a === "date") return "DATE";
  if (a === "me") return "SOLO";
  return null; // 'both' or unknown → no badge, keeps it clean
}

/** Missing-thumbnail art: 404 cybersigil + label. */
function ImageNotFound() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1">
      <AsciiSigil name="notFound404" tone="accent" opacity={0.6} className="text-[0.45rem]" />
      <span className="text-[0.55rem] uppercase tracking-term text-faint">image not found</span>
    </div>
  );
}

/**
 * ASCII-framed event card. Box-drawing tag bar + real event image (with an
 * AsciiSigil fallback when the og:image is missing or fails to load), title,
 * when/price, blurb, open link, and a dismiss form (server action).
 */
export function EventCard({ event }: { event: EventCardData }) {
  const [imgFailed, setImgFailed] = useState(!event.imageUrl);
  const tag = (event.tag ?? "misc").toUpperCase();
  const aud = audienceLabel(event.audience);

  return (
    <div className="relative flex flex-col border border-edge bg-panel2">
      {/* Tag bar — box-drawing legend */}
      <div className="flex items-center justify-between border-b border-edge px-2 py-1 text-[0.6rem] uppercase tracking-term">
        <span className="text-accent">┌─[ {tag} ]</span>
        {aud && <span className="text-faint">{aud}</span>}
      </div>

      {/* Image / fallback */}
      {event.url ? (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block h-32 overflow-hidden border-b border-edge bg-ink"
        >
          {!imgFailed && event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl}
              alt=""
              className="h-full w-full object-cover opacity-90"
              onError={() => setImgFailed(true)}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ImageNotFound />
          )}
        </a>
      ) : (
        <div className="relative flex h-32 w-full items-center justify-center overflow-hidden border-b border-edge bg-ink">
          <ImageNotFound />
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`shrink-0 whitespace-nowrap text-[0.68rem] uppercase tracking-term ${
              event.isWeekend ? "text-ok" : "text-muted"
            }`}
          >
            {event.whenText ?? "date tbc"}
          </span>
          {event.price && (
            <span
              title={event.price}
              className={`min-w-0 truncate text-right text-[0.62rem] uppercase tracking-term ${priceClass(event.priceLevel)}`}
            >
              {shortPrice(event.price)}
            </span>
          )}
        </div>

        <div className="text-[0.8rem] leading-tight text-ink2">{event.title}</div>

        {event.description && (
          <p className="text-[0.68rem] leading-relaxed text-muted">{event.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1.5">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.65rem] uppercase tracking-term text-accent hover:text-accent2"
            >
              {event.url.startsWith("https://www.google.com/search") ? "» search event" : "» open event"}
            </a>
          ) : (
            <span className="text-[0.65rem] uppercase tracking-term text-faint">no link — search title</span>
          )}
          <form action={dismissEvent}>
            <input type="hidden" name="id" value={event.id} />
            <button
              type="submit"
              title="Dismiss"
              className="text-faint hover:text-danger"
              aria-label="Dismiss event"
            >
              ×
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
