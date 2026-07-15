"use client";

import { useState } from "react";
import { AsciiSigil } from "./AsciiSigil";
import { dismissEvent } from "../actions";

export interface EventCardData {
  id: number;
  title: string;
  url: string;
  description: string | null;
  tag: string | null;
  audience: string | null;
  whenText: string | null;
  isWeekend: boolean;
  price: string | null;
  priceLevel: string | null;
  imageUrl: string | null;
}

function priceClass(level: string | null): string {
  if (level === "free") return "text-ok";
  if (level === "moderate") return "text-amber";
  return "text-accent"; // cheap / unknown
}

function audienceLabel(a: string | null): string | null {
  if (a === "date") return "DATE";
  if (a === "me") return "SOLO";
  return null; // 'both' or unknown → no badge, keeps it clean
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
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <AsciiSigil name="runeEye" tone="accent" opacity={0.18} className="text-[0.5rem]" />
          </div>
        )}
      </a>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[0.68rem] uppercase tracking-term ${event.isWeekend ? "text-ok" : "text-muted"}`}>
            {event.whenText ?? "date tbc"}
          </span>
          {event.price && (
            <span className={`shrink-0 text-[0.62rem] uppercase tracking-term ${priceClass(event.priceLevel)}`}>
              {event.price}
            </span>
          )}
        </div>

        <div className="text-[0.8rem] leading-tight text-ink2">{event.title}</div>

        {event.description && (
          <p className="text-[0.68rem] leading-relaxed text-muted">{event.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1.5">
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.65rem] uppercase tracking-term text-accent hover:text-accent2"
          >
            » open event
          </a>
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
