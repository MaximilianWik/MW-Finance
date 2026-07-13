import type { ReactNode } from "react";

export interface GameChipContext {
  /** Effective hourly rate (manual or salary-derived); null hides the hours chip. */
  hourlyRate: number | null;
  /** Primary goal + remaining kr to target; null hides the trade-off chip. */
  goal: { name: string; remaining: number } | null;
}

function fmtHours(h: number): string {
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

function Chip({ children, tone }: { children: ReactNode; tone: "faint" | "amber" }) {
  const cls = tone === "amber" ? "text-amber/70" : "text-faint";
  return (
    <span className={`whitespace-nowrap text-[0.6rem] uppercase tracking-term ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Loss-framed cost chips for an outflow row:
 *   • hours-worked   — "≈ 3.2h"           (how long you worked to pay for this)
 *   • goal trade-off — "= 8% of Japan"    (discretionary only; share of the
 *                                          remaining distance to the primary goal)
 * Renders nothing for inflows or when context is missing.
 */
export function TxChips({
  signed,
  discretionary,
  ctx,
}: {
  signed: number;
  discretionary: boolean;
  ctx: GameChipContext;
}) {
  if (signed >= 0) return null;
  const spent = Math.abs(signed);

  const hours =
    ctx.hourlyRate && ctx.hourlyRate > 0 ? spent / ctx.hourlyRate : null;

  const goalPct =
    discretionary && ctx.goal && ctx.goal.remaining > 0
      ? Math.round((spent / ctx.goal.remaining) * 100)
      : null;

  if (hours == null && goalPct == null) return null;

  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {hours != null && (
        <Chip tone="faint" key="h">
          {"\u2248"} {fmtHours(hours)}
        </Chip>
      )}
      {goalPct != null && ctx.goal && (
        <Chip tone="amber" key="g">
          = {goalPct}% of {ctx.goal.name}
        </Chip>
      )}
    </span>
  );
}
