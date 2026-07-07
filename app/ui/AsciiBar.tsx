/**
 * ASCII progress bar: [████████░░░░] 67%
 *
 * Pure text so it aligns in monospace tables and reads as terminal output.
 * `tone` overrides the fill color; by default it derives from ratio
 * (green → amber ≥85% → red >100%).
 */
export function AsciiBar({
  ratio,
  width = 16,
  showPct = true,
  tone,
  className = "",
}: {
  ratio: number; // 0..1+ (can exceed 1 when over budget)
  width?: number;
  showPct?: boolean;
  tone?: "ok" | "warn" | "danger" | "muted" | "accent2";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);

  const derived: NonNullable<typeof tone> =
    ratio > 1 ? "danger" : ratio >= 0.85 ? "warn" : "ok";
  const t = tone ?? derived;
  const color =
    t === "danger"  ? "text-danger"
    : t === "warn"  ? "text-amber"
    : t === "ok"    ? "text-ok"
    : t === "muted" ? "text-muted"
    : t === "accent2" ? "text-accent2"
    : "text-accent"; // default / accent

  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      <span className="text-edge2">[</span>
      <span className={color}>{"█".repeat(filled)}</span>
      <span className="text-grid">{"░".repeat(empty)}</span>
      <span className="text-edge2">]</span>
      {showPct && <span className={`ml-2 ${color}`}>{pct}%</span>}
    </span>
  );
}
