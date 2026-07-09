"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AsciiSigil } from "./AsciiSigil";

/**
 * Shared line-colouring for every terminal console. Matches the `[TAG]` grammar
 * used across the server log streams.
 */
export function lineColor(l: string): string {
  const t = l.trimStart();
  if (t.startsWith("[FAIL]")) return "text-danger";
  if (t.startsWith("[!]")) return "text-danger";
  if (t.startsWith("[WARN]") || t.startsWith("[~]")) return "text-amber";
  if (t.startsWith("[DONE]")) return "text-accent";
  if (t.startsWith("[OK]") || t.startsWith("[✓]") || t.startsWith("[SET]")) return "text-ok";
  if (t.startsWith("[NEW]")) return "text-accent2";
  if (t.startsWith("[SKIP]")) return "text-faint";
  if (t.startsWith("[AI]")) return "text-accent2";
  if (t.startsWith("[BOOT]")) return "text-muted";
  if (t.startsWith("[SYNC]")) return "text-muted";
  if (l.startsWith(">   ")) return "text-faint";   // SQL clause continuation
  if (l.startsWith("> "))  return "text-ink2";     // SQL first line
  if (t.startsWith("[DIAG]") || t.startsWith("(")) return "text-amber/60";
  if (l.startsWith("       ")) return "text-faint";
  return "text-muted";
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Braille spinner that animates on its own timer. */
export function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, []);
  return <span className="text-accent">{SPINNER[i]}</span>;
}

export interface Typewriter {
  shown: string;   // text revealed so far
  busy: boolean;   // stream open or still typing out buffered text
  typing: boolean; // actively revealing characters right now
  reset: () => void;
  push: (chunk: string) => void;
  endStream: () => void;
}

/**
 * Typewriter buffer for streamed text. Server output is pushed in as it arrives;
 * the hook reveals it character-by-character on a fixed cadence so the log
 * *always* types out live, regardless of how the network delivers the bytes
 * (which is often one big burst). Reveal speed scales up when far behind so a
 * large backlog never feels sluggish.
 */
export function useTypewriter(): Typewriter {
  const rawRef = useRef("");
  const shownRef = useRef(0);
  const streamOpenRef = useRef(false);
  const [shownCount, setShownCount] = useState(0);
  const [active, setActive] = useState(false);

  const reset = useCallback(() => {
    rawRef.current = "";
    shownRef.current = 0;
    streamOpenRef.current = true;
    setShownCount(0);
    setActive(true);
  }, []);

  const push = useCallback((chunk: string) => {
    rawRef.current += chunk;
  }, []);

  const endStream = useCallback(() => {
    streamOpenRef.current = false;
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const target = rawRef.current.length;
      if (shownRef.current >= target) {
        if (!streamOpenRef.current) setActive(false); // fully caught up + stream closed
        return;
      }
      const backlog = target - shownRef.current;
      const step = backlog > 600 ? 40 : backlog > 200 ? 12 : backlog > 60 ? 4 : 2;
      shownRef.current = Math.min(target, shownRef.current + step);
      setShownCount(shownRef.current);
    }, 16);
    return () => clearInterval(id);
  }, [active]);

  return {
    shown: rawRef.current.slice(0, shownCount),
    busy: active,
    typing: active && shownCount < rawRef.current.length,
    reset,
    push,
    endStream,
  };
}

/**
 * Terminal log renderer. Types out `shown`, blinks a caret while typing, and
 * shows an animated spinner whenever the console is busy but waiting on more
 * server output.
 */
export function TerminalLog({
  shown,
  busy,
  typing,
  className = "",
}: {
  shown: string;
  busy: boolean;
  typing: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown, busy, typing]);

  const lines = shown.length ? shown.split("\n") : [];

  return (
    <div className="relative">
      <pre
        ref={ref}
        className={`max-h-72 overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed ${className}`}
      >
        {lines.map((l, i) => (
          <div key={i} className={lineColor(l)}>
            {l}
            {typing && i === lines.length - 1 && <span className="caret" />}
          </div>
        ))}
        {busy && !typing && (
          <div className="text-muted">
            <Spinner /> <span className="text-faint">working…</span>
          </div>
        )}
      </pre>
      {/* Right-side sigil accent — rendered over the log surface */}
      <AsciiSigil
        name="runeEye"
        tone="accent"
        opacity={0.14}
        className="pointer-events-none absolute right-2 top-2 select-none text-[0.42rem]"
      />
    </div>
  );
}
