"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface TipProps {
  children: ReactNode;
  /** Optional short title shown in bold at the top of the panel. */
  title?: string;
  /** Where the panel opens relative to the [?] button. Defaults to "above". */
  side?: "above" | "below";
}

/**
 * Click-to-toggle info tooltip. Renders a small [?] button inline; clicking it
 * opens a terminal-styled panel with an explanation. Clicking outside closes it.
 * Works on both desktop (hover-equivalent via click) and mobile.
 */
export function Tip({ children, title, side = "above" }: TipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`ml-1 select-none text-[0.58rem] uppercase tracking-term transition-colors ${
          open ? "text-accent2" : "text-faint hover:text-accent2"
        }`}
        aria-label="More information"
      >
        [?]
      </button>

      {open && (
        <span
          className={`absolute ${side === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"} left-0 z-50 w-64 border border-edge/80 bg-panel px-3 py-2.5 text-left shadow-lg`}
          style={{ minWidth: "14rem" }}
        >
          {title && (
            <span className="mb-1.5 block text-[0.65rem] font-medium uppercase tracking-term text-accent2">
              {title}
            </span>
          )}
          <span className="block text-[0.65rem] leading-relaxed text-muted">
            {children}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[0.58rem] uppercase tracking-term text-faint hover:text-accent"
          >
            [ close ]
          </button>
        </span>
      )}
    </span>
  );
}
