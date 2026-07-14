import Link from "next/link";
import { kr } from "@/lib/format";
import type { ReactorSnapshot } from "@/lib/game/snapshot";
import { Panel } from "./Panel";
import { ReactorCore } from "./ReactorCore";

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
        <span
          key={i}
          className="text-base leading-none"
          style={{ color: i < count ? "#5cc8e8" : "#252530" }}
          title={i < count ? "Shield available" : "No shield"}
        >
          {i < count ? "◆" : "◇"}
        </span>
      ))}
    </span>
  );
}

/**
 * Overview reactor panel. Receives snapshot from the parent page's try/catch
 * so game table errors never crash the dashboard.
 */
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
        {/* Animated core */}
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
            </span>
            <span className="text-[0.65rem] uppercase tracking-term text-faint">
              {level.xp.toLocaleString("sv-SE")} XP
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Meter value={level.progress} color={hue} />
            <span className="text-[0.62rem] uppercase tracking-term text-faint">
              {level.next
                ? `${(level.xpForNext! - level.xpIntoTier).toLocaleString("sv-SE")} XP to ${level.next.name}`
                : "maximum output"}
            </span>
          </div>

          {/* Uptime + shields */}
          <div className="flex items-center justify-between border-t border-edge pt-2 text-[0.7rem] uppercase tracking-term">
            <span className="text-muted">uptime</span>
            <div className="flex items-center gap-3">
              <Shields count={shields} />
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

          {/* Stored charge */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-term">
              <span className="text-muted">stored charge</span>
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
              <span className="text-faint">next unlock</span>
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
