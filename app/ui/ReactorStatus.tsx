import Link from "next/link";
import { kr } from "@/lib/format";
import type { ReactorSnapshot } from "@/lib/game/snapshot";
import { Panel } from "./Panel";
import { ReactorCore } from "./ReactorCore";

function Meter({ value, color, track = "#252530" }: { value: number; color: string; track?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden" style={{ background: track }}>
      <div
        className="h-full"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }}
      />
    </div>
  );
}

/**
 * Overview reactor panel. Receives a pre-fetched snapshot from the parent
 * page so error handling stays in the page's try/catch. Returns null when
 * no snapshot is available (DB not yet migrated, etc.).
 */
export function ReactorStatus({ snap }: { snap: ReactorSnapshot | null }) {
  if (!snap) return null;
  const { level, streak, pot } = snap;
  const hue = level.danger ? "#e85252" : level.tier.color;

  return (
    <Panel
      title="REACTOR CORE"
      right={<Link href="/rank" className="text-accent2 hover:underline">» rank</Link>}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0">
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

          {/* Uptime */}
          <div className="flex items-center justify-between border-t border-edge pt-2 text-[0.7rem] uppercase tracking-term">
            <span className="text-muted">reactor uptime</span>
            {level.danger ? (
              <span className="text-danger">[!] containment breach</span>
            ) : (
              <span className="text-accent">
                {streak.current}d{" "}
                {streak.best > streak.current && (
                  <span className="text-faint">· best {streak.best}d</span>
                )}
              </span>
            )}
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
        </div>
      </div>
    </Panel>
  );
}
