/**
 * ASCII progress bar: [########....] 67%
 *
 * Pure text so it aligns in monospace tables and reads as terminal output.
 * `barColor` (a hex string) overrides the fill + percentage color, e.g. to
 * match a category's swatch. Otherwise `tone` (or a ratio-derived tone:
 * green -> amber >=85% -> red >100%) picks a themed class.
 */
export function AsciiBar({
  ratio,
  width = 16,
  showPct = true,
  tone,
  barColor,
  className = "",
}: {
  ratio: number; // 0..1+ (can exceed 1 when over budget)
  width?: number;
  showPct?: boolean;
  tone?: "ok" | "warn" | "danger" | "muted" | "accent2";
  barColor?: string; // explicit hex; overrides tone/derived color
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);

  const derived: NonNullable<typeof tone> =
    ratio > 1 ? "danger" : ratio >= 0.85 ? "warn" : "ok";
  const t = tone ?? derived;
  const toneClass =
    t === "danger"  ? "text-danger"
    : t === "warn"  ? "text-amber"
    : t === "ok"    ? "text-ok"
    : t === "muted" ? "text-muted"
    : t === "accent2" ? "text-accent2"
    : "text-accent"; // default / accent

  const fillClass = barColor ? "" : toneClass;
  const pctClass = barColor ? "ml-2" : `ml-2 ${toneClass}`;
  const fillStyle = barColor ? { color: barColor } : undefined;

  const bar = "\u2588".repeat(filled);
  const rest = "\u2591".repeat(empty);

  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      <span className="text-edge2">[</span>
      <span className={fillClass} style={fillStyle}>{bar}</span>
      <span className="text-grid">{rest}</span>
      <span className="text-edge2">]</span>
      {showPct && (
        <span className={pctClass} style={fillStyle}>
          {pct}%
        </span>
      )}
    </span>
  );
}