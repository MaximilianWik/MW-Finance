import Link from "next/link";
import { kr } from "@/lib/format";
import type { ReactorSnapshot } from "@/lib/game/snapshot";
import { Panel } from "./Panel";
import { ReactorCore } from "./ReactorCore";
import { Tip } from "./Tip";

function Meter({ value, color, track = "#252530" }: { value: number; color: string; track?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden" style={{ background: track }}>
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }}
      />
    </div>
  );
}

function Shields({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="text-base leading-none"
          style={{ color: i < count ? "#5cc8e8" : "#252530" }}>
          {i < count ? "◆" : "◇"}
        </span>
      ))}
    </span>
  );
}

export function ReactorStatus({ snap }: { snap: ReactorSnapshot | null }) {
  if (!snap) return null;
  const { level, streak, pot, shields, nextMilestone } = snap;
  const hue = level.danger ? "#e85252" : level.tier.color;

  return (
    <Panel
      title="REACTOR CORE"
      right={<Link href="/rank" className="text-accent2 hover:underline">» rank</Link>}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0" style={{ animation: "reactor-enter 0.6s ease-out" }}>
          <ReactorCore
            tierIndex={level.index}
            color={level.tier.color}
            progress={level.progress}
            danger={level.danger}
            size={132}
          />
        </div>

        <div className="flex w-full flex-col gap-3">
          {/* Tier + XP */}
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold uppercase tracking-term" style={{ color: hue }}>
              {level.tier.name}
              <Tip title={level.tier.name} side="below">
                {level.tier.blurb}
                {" "}Threshold: {level.tier.minXp.toLocaleString("sv-SE")} XP.
              </Tip>
            </span>
            <span className="text-[0.65rem] uppercase tracking-term text-faint">
              {level.xp.toLocaleString("sv-SE")} XP
            </span>
          </div>

          {/* XP bar */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-[0.6rem] uppercase tracking-term text-faint">xp</span>
              <Tip title="How XP is calculated">
                <strong>Formula (derived live, never stored):</strong>
                <br />· floor(savings / 100) × 5
                <br />· floor(investments / 100) × 8
                <br />· best streak days × 50
                <br />· unlocked achievement XP
                <br />· completed challenge XP
                <br /><br />
                Investing earns more per kr because it is deployed, compounding capital.
                Re-categorise Lysa to "Investments" in the ledger to unlock investment XP.
              </Tip>
            </div>
            <Meter value={level.progress} color={hue} />
            <span className="text-[0.62rem] uppercase tracking-term text-faint">
              {level.next
                ? `${(level.xpForNext! - level.xpIntoTier).toLocaleString("sv-SE")} XP to ${level.next.name}`
                : "maximum output"}
            </span>
          </div>

          {/* Uptime + shields */}
          <div className="flex items-center justify-between border-t border-edge pt-2 text-[0.7rem] uppercase tracking-term">
            <span className="flex items-center text-muted">
              uptime
              <Tip title="Containment uptime">
                Consecutive days where counted spend (excl. Transfers and Savings) stayed at or
                below daily pace. Zero-spend days count clean. Breaks the moment a day exceeds
                pace, unless a shield absorbs it.
              </Tip>
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center">
                <Shields count={shields} />
                <Tip title="Shields">
                  Earn 1 shield for each completed 7-day clean run (max 3 banked).
                  When a breach occurs: if a shield is available, it absorbs the breach and
                  uptime continues unbroken. No shields left means the streak resets to 0.
                </Tip>
              </span>
              {level.danger ? (
                <span className="text-danger">[!] breach</span>
              ) : (
                <span className="text-accent">
                  {streak.current}d
                  {streak.best > streak.current && (
                    <span className="ml-1 text-faint">· best {streak.best}d</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Daily pace */}
          <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-term">
            <span className="flex items-center text-muted">
              daily pace
              <Tip title="Daily pace">
                Total monthly budget divided by the number of days in your current salary cycle.
                <br /><br />
                Currently: {kr(pot.pace)}/day.
                <br /><br />
                A day is "clean" when counted spend (excl. Transfers and Savings) is at or below
                this number. Adjust budgets on /budgets to change the pace.
              </Tip>
            </span>
            <span className="text-ink2">{kr(pot.pace)}<span className="ml-1 text-faint">/day</span></span>
          </div>

          {/* Stored charge */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-term">
              <span className="flex items-center text-muted">
                stored charge
                <Tip title="Stored charge (capacitor)">
                  Measured Monday through today. Each day that ends under daily pace banks
                  (pace - spend) kr of charge. Each day over pace discharges it by the same
                  amount. Floored at 0 (cannot go negative). Resets every Monday.
                  <br /><br />
                  The bar shows charge as a fraction of the theoretical maximum for days elapsed
                  this week (pace × days elapsed).
                </Tip>
              </span>
              <span className={pot.discharging ? "text-danger" : "text-accent2"}>
                {kr(pot.charge)}
              </span>
            </div>
            <Meter value={pot.fill} color={pot.discharging ? "#e85252" : "#5cc8e8"} />
            <span className="text-[0.62rem] uppercase tracking-term text-faint">
              {pot.discharging
                ? "discharging, today broke pace"
                : "an overspend day discharges the capacitor"}
            </span>
          </div>

          {/* Next milestone */}
          {nextMilestone && (
            <div className="flex items-center justify-between border-t border-edge pt-2 text-[0.65rem] uppercase tracking-term">
              <span className="flex items-center text-faint">
                next unlock
                <Tip title="Next milestone">
                  The locked achievement you are numerically closest to. Computed as
                  current / target across all unlockable achievements, ranked by highest
                  completion percentage.
                </Tip>
              </span>
              <span style={{ color: nextMilestone.color }}>
                {nextMilestone.name}
                <span className="ml-1 text-faint">
                  ({nextMilestone.needed.toLocaleString("sv-SE")}{" "}
                  {nextMilestone.unit} away)
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
