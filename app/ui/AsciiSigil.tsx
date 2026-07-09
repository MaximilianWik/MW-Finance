import { SIGILS, type SigilName } from "./sigils";

/**
 * Renders a cybersigil (braille ASCII art) as inert, decorative terminal
 * output. Always `aria-hidden` — it carries no information, only atmosphere,
 * and must never interfere with screen readers or text selection.
 *
 * Phosphor-green by default, tuned down via `opacity`. Keep `opacity` low
 * (≤ 0.12) for anything layered near readable content — the house rule is that
 * decoration never compromises legibility.
 */
export function AsciiSigil({
  name,
  className = "",
  opacity = 1,
  glow = false,
  tone = "accent",
}: {
  name: SigilName;
  className?: string;
  opacity?: number;
  glow?: boolean;
  /** color hook — accent phosphor (default), dim edge, or muted grey */
  tone?: "accent" | "edge" | "muted";
}) {
  const toneClass =
    tone === "edge" ? "text-edge2" : tone === "muted" ? "text-muted" : "text-accent";

  return (
    <pre
      aria-hidden="true"
      className={`pointer-events-none select-none whitespace-pre font-mono leading-[1.05] ${toneClass} ${
        glow ? "glow" : ""
      } ${className}`}
      style={{ opacity }}
    >
      {SIGILS[name]}
    </pre>
  );
}
