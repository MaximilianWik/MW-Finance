import Link from "next/link";
import { kr } from "@/lib/format";
import { getReactorSnapshot } from "@/lib/game/snapshot";
import { getUnlocked, ACHIEVEMENTS } from "@/lib/game/achievements";
import { getActiveChallenges } from "@/lib/game/challenges";
import { getDayHistory } from "@/lib/game/history";
import { getWealthVelocity, getFuelEfficiency } from "@/lib/game/velocity";
import { TIERS } from "@/lib/game/level";
import { Panel } from "../ui/Panel";
import { ReactorCore } from "../ui/ReactorCore";
import { StreakCalendar } from "../ui/StreakCalendar";
import { XpBreakdown } from "../ui/XpBreakdown";
import { AiConsole } from "../ui/AiConsole";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function RankPage() {
  const t0 = Date.now();

  let snap:       Awaited<ReturnType<typeof getReactorSnapshot>> | null = null;
  let unlocked:   Awaited<ReturnType<typeof getUnlocked>>        = [];
  let challenges: Awaited<ReturnType<typeof getActiveChallenges>> = [];
  let history:    Awaited<ReturnType<typeof getDayHistory>>       = [];
  let velocity:   Awaited<ReturnType<typeof getWealthVelocity>> | null = null;
  let efficiency: Awaited<ReturnType<typeof getFuelEfficiency>>  | null = null;
  let queryLog:   { sql: string }[]                              = [];
  let dbError:    string | null                                  = null;

  try {
    const [[s, u, c, h], ql] = await withQueryLog(() =>
      Promise.all([getReactorSnapshot(), getUnlocked(), getActiveChallenges(), getDayHistory()])
    );
    snap = s; unlocked = u; challenges = c; history = h; queryLog = ql;
    // Velocity + efficiency are non-critical; fetch after core data.
    if (snap) {
      [velocity, efficiency] = await Promise.all([
        getWealthVelocity(snap.level.xp, snap.level.index),
        getFuelEfficiency(),
      ]).catch(() => [null, null]);
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const tookMs = Date.now() - t0;

  if (dbError) {
    return (
      <main className="flex flex-col gap-4">
        <Panel title="REACTOR CORE">
          <p className="text-sm text-muted">
            Reactor offline. Run the phase 5 migration in Neon, then reload.
          </p>
          <pre className="mt-2 overflow-x-auto border border-edge bg-ink p-2 text-[0.7rem] text-danger">
            {dbError}
          </pre>
        </Panel>
      </main>
    );
  }

  if (!snap) return null;

  const { level, streak, pot, savingsTotal, investmentsTotal, xpInputs, shields, directiveStreak, nextMilestone } = snap;
  const hue = level.danger ? "#e85252" : level.tier.color;
  const unlockedIds   = new Set(unlocked.map((a) => a.id));
  const recentUnlocks = unlocked.slice(0, 3);

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="CORE" />

      {/* ── Reactor core + tier ladder ─────────────────────────────────── */}
      <Panel title="REACTOR CORE" right={<span style={{ color: hue }}>{level.tier.name}</span>}>
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2"
            style={{ animation: "reactor-enter 0.8s ease-out" }}>
            <ReactorCore
              tierIndex={level.index}
              color={level.tier.color}
              progress={level.progress}
              danger={level.danger}
              size={260}
            />
            <p className="max-w-[16rem] text-center text-[0.7rem] leading-relaxed text-muted">
              {level.danger
                ? "[!] Containment breach. Output destabilised. Get back under pace."
                : level.tier.blurb}
            </p>
          </div>

          <div className="flex w-full flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold uppercase tracking-term" style={{ color: hue }}>
                {level.tier.name}
              </span>
              <span className="text-sm uppercase tracking-term text-faint">
                {level.xp.toLocaleString("sv-SE")} XP
              </span>
            </div>

            {/* XP progress to next tier */}
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden bg-edge">
                <div className="h-full" style={{ width: `${Math.round(level.progress * 100)}%`, background: hue }} />
              </div>
              <span className="text-[0.65rem] uppercase tracking-term text-faint">
                {level.next
                  ? `${(level.xpForNext! - level.xpIntoTier).toLocaleString("sv-SE")} XP to ${level.next.name}`
                  : "maximum output, singularity sustained"}
              </span>
            </div>

            {/* Stats: 6-wide on large, 3+3 on mobile */}
            <div className="grid grid-cols-3 gap-3 border-t border-edge pt-3 text-center sm:grid-cols-6">
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">uptime</div>
                <div className={`text-lg tabular-nums ${level.danger ? "text-danger" : "text-accent"}`}>
                  {level.danger ? "BREACH" : `${streak.current}d`}
                </div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">best {streak.best}d</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">shields</div>
                <div className="flex items-center justify-center gap-0.5 py-0.5">
                  {[0,1,2].map((i) => (
                    <span key={i} style={{ color: i < shields ? "#5cc8e8" : "#252530", fontSize:"1.1rem", lineHeight:1 }}>
                      {i < shields ? "◆" : "◇"}
                    </span>
                  ))}
                </div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">{shields}/3 banked</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">charge</div>
                <div className={`text-lg tabular-nums ${pot.discharging ? "text-danger" : "text-accent2"}`}>
                  {kr(pot.charge)}
                </div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">{kr(pot.pace)}/day</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">saved</div>
                <div className="text-lg tabular-nums text-ink2">{kr(savingsTotal)}</div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">all-time</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">invested</div>
                <div className="text-lg tabular-nums text-accent2">{kr(investmentsTotal)}</div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">all-time</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-term text-muted">directives</div>
                <div className="text-lg tabular-nums text-ink2">{directiveStreak}w</div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">run streak</div>
              </div>
            </div>

            {/* Next milestone */}
            {nextMilestone && (
              <div className="flex items-center justify-between rounded border border-edge bg-panel2 px-3 py-2 text-[0.68rem] uppercase tracking-term">
                <span className="text-faint">next unlock</span>
                <span style={{ color: nextMilestone.color }}>
                  {nextMilestone.name}
                </span>
                <span className="text-faint">
                  {nextMilestone.needed.toLocaleString("sv-SE")} {nextMilestone.unit} away
                  <span className="ml-1 text-[0.58rem]">· +{nextMilestone.xp} XP</span>
                </span>
              </div>
            )}

            {/* Tier ladder */}
            <div className="flex flex-col gap-0.5 border-t border-edge pt-3">
              {TIERS.map((tier, i) => {
                const reached  = i <= level.index;
                const isCurrent = i === level.index;
                return (
                  <div
                    key={tier.name}
                    className={`flex items-center justify-between px-2 py-0.5 text-[0.68rem] uppercase tracking-term ${isCurrent ? "bg-panel2" : ""}`}
                  >
                    <span style={{ color: reached ? tier.color : "#454552" }}>
                      {isCurrent ? "» " : reached ? "· " : "  "}
                      {tier.name}
                    </span>
                    <span className={reached ? "text-faint" : "text-faint/50"}>
                      {tier.minXp.toLocaleString("sv-SE")} XP
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Reactor metrics (velocity + efficiency) ───────────────────── */}
      {(velocity || efficiency) && (
        <Panel title="REACTOR METRICS">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Wealth velocity */}
            {velocity && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[0.65rem] uppercase tracking-term text-muted">wealth velocity</div>
                <div className="text-xl tabular-nums text-accent">
                  {velocity.krPerMonth > 0 ? kr(velocity.krPerMonth) }
                  <span className="ml-1 text-sm font-normal text-faint">/month</span>
                </div>
                <div className="text-[0.65rem] text-faint">
                  rolling 3-month average (savings + investments)
                </div>
                {velocity.projectedMonths != null && velocity.projectedTierName && (
                  <div className="mt-1 text-[0.68rem] uppercase tracking-term text-accent2">
                    at this rate: {velocity.projectedTierName} in ~{velocity.projectedMonths}mo
                  </div>
                )}
              </div>
            )}

            {/* Fuel efficiency */}
            {efficiency && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[0.65rem] uppercase tracking-term text-muted">fuel efficiency</div>
                <div className="text-xl tabular-nums text-accent">
                  {efficiency.pct != null
                    ? `${Math.round(efficiency.pct * 100)}%`
                    }
                  <span className="ml-1 text-sm font-normal text-faint">of salary</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden bg-edge">
                  <div
                    className="h-full"
                    style={{
                      width: efficiency.pct != null ? `${Math.min(100, Math.round(efficiency.pct * 100))}%` : "0%",
                      background: (efficiency.pct ?? 0) >= 0.2 ? "#4ec96a" : (efficiency.pct ?? 0) >= 0.1 ? "#e8c545" : "#e85252",
                    }}
                  />
                </div>
                <div className="text-[0.65rem] text-faint">
                  {kr(efficiency.monthlySavingsInvest)} saved+invested this month
                  {efficiency.salary && ` of ${kr(efficiency.salary)} salary`}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ── Containment log ────────────────────────────────────────────── */}
      <Panel title="CONTAINMENT LOG">
        <StreakCalendar
          records={history}
          currentStreak={streak.current}
          bestStreak={streak.best}
        />
      </Panel>

      {/* ── Reactor fuel (XP breakdown) ────────────────────────────────── */}
      <Panel title="REACTOR FUEL">
        <XpBreakdown inputs={xpInputs} />
      </Panel>

      {/* ── Weekly directives ──────────────────────────────────────────── */}
      <Panel title="WEEKLY DIRECTIVES" right={
        <span className="text-faint text-[0.65rem]">
          {challenges.filter((c) => c.status === "complete").length} / {challenges.length} cleared
        </span>
      }>
        {challenges.length === 0 ? (
          <p className="py-2 text-sm text-muted">
            No directives yet. Run an eval to generate this week&apos;s slate.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {challenges.map((c) => {
              const progress  = Number(c.progress);
              const target    = Number(c.target);
              const pct       = target > 0 ? Math.min(1, progress / target) : 0;
              const barColor  = c.status === "complete" ? "#4ec96a" : c.status === "failed" ? "#e85252" : "#5cc8e8";
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[0.72rem] uppercase tracking-term">
                    <span className="text-ink2">{c.title}</span>
                    <span className={
                      c.status === "complete" ? "text-accent"
                      : c.status === "failed"  ? "text-danger"
                      : "text-faint"
                    }>
                      {c.status === "complete" ? `[ CLEARED +${c.rewardXp} XP ]`
                        : c.status === "failed" ? "[ FAILED ]"
                        : c.lowerIsBetter ? `${kr(progress)} / ${kr(target)}`
                        : `${Math.floor(progress)} / ${Math.floor(target)}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden bg-edge">
                    <div className="h-full" style={{ width: `${Math.round(pct * 100)}%`, background: barColor }} />
                  </div>
                  <span className="text-[0.62rem] lowercase text-faint">
                    {c.description} · +{c.rewardXp} XP
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 border-t border-edge pt-3">
          <p className="mb-2 text-[0.7rem] leading-relaxed text-muted">
            Reactor evaluates nightly after each sync. Manual eval refreshes uptime,
            resolves directives and unlocks achievements immediately.
          </p>
          <AiConsole endpoint="/api/game/eval" label="$ run eval" pendingLabel="evaluating…" />
        </div>
      </Panel>

      {/* ── Achievement log ────────────────────────────────────────────── */}
      <Panel
        title="ACHIEVEMENT LOG"
        right={`${unlocked.length} / ${ACHIEVEMENTS.length}`}
      >
        {/* Recent unlocks spotlighted */}
        {recentUnlocks.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 border-b border-edge pb-4">
            {recentUnlocks.map((a) => (
              <div
                key={a.id}
                className="flex flex-col items-center gap-1 border border-edge px-3 py-2 text-center"
                style={{ borderColor: a.color + "55" }}
              >
                <span className="text-lg" style={{ color: a.color }}>◆</span>
                <span className="text-[0.65rem] uppercase tracking-term" style={{ color: a.color }}>
                  {a.name}
                </span>
                <span className="text-[0.58rem] text-faint">+{a.xp} XP</span>
              </div>
            ))}
          </div>
        )}

        {/* Full list */}
        <ul className="flex flex-col divide-y divide-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = unlockedIds.has(a.id);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span aria-hidden style={{ color: has ? a.color : "#454552" }}>
                      {has ? "◆" : "◇"}
                    </span>
                    <span
                      className="text-[0.78rem] uppercase tracking-term"
                      style={{ color: has ? a.color : "#454552" }}
                    >
                      {a.name}
                    </span>
                  </div>
                  <span className={`block pl-5 text-[0.63rem] ${has ? "text-muted" : "text-faint/60"}`}>
                    {a.description}
                  </span>
                </div>
                <span className={`shrink-0 text-[0.62rem] uppercase tracking-term ${has ? "text-faint" : "text-faint/40"}`}>
                  +{a.xp} XP
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 text-center">
          <Link href="/" className="btn text-[0.65rem]">» overview</Link>
        </div>
      </Panel>
    </main>
  );
}
