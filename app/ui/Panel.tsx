import type { ReactNode } from "react";

/**
 * Terminal window panel with a titled ASCII frame.
 *
 *   ┌─[ TITLE ]──────────────────┐
 *   │  …content…                 │
 *   └────────────────────────────┘
 *
 * The frame is drawn with a 1px border + a bracket-legend title + corner
 * glyphs (see .panel in globals.css). `right` renders in the header row,
 * aligned to the far edge — use it for status tags or counts.
 */
export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <span className="panel-title">[ {title} ]</span>
      {right && (
        <span className="absolute -top-[0.62rem] right-3 bg-ink px-2 text-[0.7rem] uppercase tracking-term">
          {right}
        </span>
      )}
      {children}
    </section>
  );
}
