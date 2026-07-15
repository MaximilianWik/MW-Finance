import Link from "next/link";
import { kr } from "@/lib/format";
import { getReactorSnapshot } from "@/lib/game/snapshot";
import { getUnlocked, ACHIEVEMENTS } from "@/lib/game/achievements";
import { getActiveChallenges } from "@/lib/game/challenges";
import { getDayHistory } from "@/lib/game/history";
import { TIERS } from "@/lib/game/level";
import { Panel } from "../ui/Panel";
import { ReactorCore } from "../ui/ReactorCore";
import { ReactorDevPanel } from "../ui/ReactorDevPanel";
import { FuelRods } from "../ui/FuelRods";
import { XpBreakdown } from "../ui/XpBreakdown";
import { AchievementBadge } from "../ui/AchievementBadge";
import { Tip } from "../ui/Tip";
import { AiConsole } from "../ui/AiConsole";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function RankPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = await (searchParams ?? Promise.resolve({} as Record<string, string | undefined>));
  const devMode = sp.dev === "1";
  const t0 = Date.now();

  let snap:       Awaited<ReturnType<typeof getReactorSnapshot>> | null = null;
  let unlocked:   Awaited<ReturnType<typeof getUnlocked>>        = [];
  let challenges: Awaited<ReturnType<typeof getActiveChallenges>> = [];
  let history:    Awaited<ReturnType<typeof getDayHistory>>       = [];
  let queryLog:   { sql: string }[]                              = [];
  let dbError:    string | null                                  = null;

  try {
    const [[s, u, c, h], ql] = await withQueryLog(() =>
      Promise.all([getReactorSnapshot(), getUnlocked(), getActiveChallenges(), getDayHistory()])
    );
    snap = s; unlocked = u; challenges = c; history = h; queryLog = ql;
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

  const { level, streak, pot, investmentsTotal, xpInputs, shields, directiveStreak, nextMilestone } = snap;
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
                <div className="anim-bar h-full" style={{ width: `${Math.round(level.progress * 100)}%`, background: hue }} />
              </div>
              <span className="text-[0.65rem] uppercase tracking-term text-faint">
                {level.next
                  ? `${(level.xpForNext! - level.xpIntoTier).toLocaleString("sv-SE")} XP to ${level.next.name}`
                  : "maximum output, singularity sustained"}
              </span>
            </div>

            {/* Stats: 5-wide on large, 3+2 on mobile */}
            <div className="grid grid-cols-3 gap-3 border-t border-edge pt-3 text-center sm:grid-cols-5">
              <div>
                <div className="inline-flex items-center justify-center text-[0.6rem] uppercase tracking-term text-muted">
                  uptime
                  <Tip title="Containment uptime" side="below">
                    Consecutive days where counted spend (excl. Transfers + Savings) stayed at or
                    below your daily pace. Zero-spend days count clean. Breaks on a breach unless a
                    shield absorbs it.
                  </Tip>
                </div>
                <div className={`text-lg tabular-nums ${level.danger ? "text-danger" : "text-accent"}`}>
                  {level.danger ? "BREACH" : `${streak.current}d`}
                </div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">best {streak.best}d</div>
              </div>

              <div>
                <div className="inline-flex items-center justify-center text-[0.6rem] uppercase tracking-term text-muted">
                  shields
                  <Tip title="Shields" side="below">
                    Earn 1 shield per completed 7-day clean run, up to 3 banked. A breach consumes
                    a shield and uptime continues unbroken. With no shields, a breach resets the
                    streak to 0.
                  </Tip>
                </div>
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
                <div className="inline-flex items-center justify-center text-[0.6rem] uppercase tracking-term text-muted">
                  charge
                  <Tip title="Stored charge" side="below">
                    Weekly capacitor (Mon to today). Each day under pace banks charge; each day
                    over drains it. Floored at 0. Resets every Monday.
                    <br /><br />
                    Daily pace: {kr(pot.pace)}/day = total budget ÷ salary cycle days.
                  </Tip>
                </div>
                <div className={`text-lg tabular-nums ${pot.discharging ? "text-danger" : "text-accent2"}`}>
                  {kr(pot.charge)}
                </div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">
                  pace {kr(pot.pace)}/day
                </div>
              </div>

              <div>
                <div className="inline-flex items-center justify-center text-[0.6rem] uppercase tracking-term text-muted">
                  invested
                  <Tip title="Investments total" side="below">
                    The Investments box total (each account's seed balance plus its matching
                    transactions). Earns 10 XP per 100 kr and is the sole capital driver of the
                    reactor, since deployed capital compounds. Add or update accounts in the
                    Investments box to move this.
                  </Tip>
                </div>
                <div className="text-lg tabular-nums text-accent2">{kr(investmentsTotal)}</div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">all-time</div>
              </div>

              <div>
                <div className="inline-flex items-center justify-center text-[0.6rem] uppercase tracking-term text-muted">
                  directives
                  <Tip title="Directive streak" side="below">
                    Consecutive calendar weeks where at least one weekly directive was cleared.
                    Breaks when a full week passes without completing any directive.
                  </Tip>
                </div>
                <div className="text-lg tabular-nums text-ink2">{directiveStreak}w</div>
                <div className="text-[0.58rem] uppercase tracking-term text-faint">run streak</div>
              </div>
            </div>

            {/* Next milestone */}
            {nextMilestone && (
              <div className="flex items-center justify-between rounded border border-edge bg-panel2 px-3 py-2 text-[0.68rem] uppercase tracking-term">
                <span className="inline-flex items-center text-faint">
                  next unlock
                  <Tip title="Next milestone">
                    The locked achievement you are numerically closest to, ranked by percentage
                    of the required value already reached. Click to see all achievements on this page.
                  </Tip>
                </span>
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

        {/* Run eval, directly below the core */}
        <div className="mt-4 border-t border-edge pt-3">
          <div className="mb-2 flex items-center text-[0.68rem] uppercase tracking-term text-muted">
            manual eval
            <Tip title="Run eval">
              Recomputes uptime, resolves this week&apos;s directives, awards shields, detects
              savings spikes and unlocks achievements. Runs automatically nightly after each
              bank sync; this button triggers it immediately.
            </Tip>
          </div>
          <AiConsole endpoint="/api/game/eval" label="$ run eval" pendingLabel="evaluating…" />
        </div>
      </Panel>

      {/* ── Containment log ────────────────────────────────────────────── */}
      <Panel title="CONTAINMENT LOG">
        <p className="mb-3 text-[0.65rem] text-faint">
          42-day fuel-rod bank. Each rod is one day; column height is the containment margin
          (headroom under daily pace). Hover or tap a rod for detail, click to pin.
          <Tip title="Fuel-rod containment log">
            Each vertical rod is one calendar day, most recent on the right.
            <br /><br />
            <strong>Bright cyan (full):</strong> zero spend, maximum containment.
            <strong> Green:</strong> spent something but stayed under daily pace; taller rod = more headroom.
            <strong> Red hot stub:</strong> breach (spend exceeded pace); the control-rod cap drops and the rod overheats below the pace line.
            <br /><br />
            The dashed line marks the minimum-containment (pace) threshold. Hover or tap a rod
            for its exact date, spend and pace.
          </Tip>
        </p>
        <FuelRods
          records={history}
          currentStreak={streak.current}
          bestStreak={streak.best}
          pace={snap.pot.pace}
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
          <ul className="flex flex-col gap-2">
            {challenges.map((c) => {
              const progress = Number(c.progress);
              const target   = Number(c.target);
              const pct      = target > 0 ? Math.min(1, progress / target) : 0;
              const complete = c.status === "complete";
              const failed   = c.status === "failed";
              const fillColor = complete ? "#4ec96a" : failed ? "#e85252" : "#5cc8e8";
              const statusText = complete
                ? `CLEARED +${c.rewardXp} XP`
                : failed ? "FAILED"
                : c.lowerIsBetter ? `${kr(progress)} / ${kr(target)}`
                : `${Math.floor(progress)} / ${Math.floor(target)}`;
              const statusClass = complete ? "text-accent" : failed ? "text-danger" : "text-faint";
              return (
                <li
                  key={c.id}
                  className="relative overflow-hidden"
                  style={{ border: `1px solid ${fillColor}28` }}
                >
                  {/* flood fill */}
                  <div
                    className="anim-bar absolute inset-y-0 left-0"
                    style={{ width: `${Math.round(pct * 100)}%`, background: fillColor, opacity: 0.14 }}
                  />
                  {/* content */}
                  <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <span className="block text-[0.72rem] uppercase tracking-term text-ink2 leading-snug">
                        {c.title}
                      </span>
                      <span className="block text-[0.6rem] lowercase text-faint mt-0.5">
                        {c.description} · +{c.rewardXp} XP
                      </span>
                    </div>
                    <span className={`shrink-0 text-[0.68rem] uppercase tracking-term ${statusClass}`}>
                      {statusText}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 border-t border-edge pt-3">
          <p className="text-[0.7rem] leading-relaxed text-muted">
            5 directives generate every Monday. Clear them before Sunday to earn XP and grow
            your directive run streak.
            <Tip title="Weekly directives" side="above">
              Types: Hold Containment (5 clean days), Dark Reactor (3 zero-spend days),
              Cold Kitchen (restaurants under 300 kr), Deploy Capital (any investment),
              Fuel the Reserve (any savings transfer).
              <br /><br />
              Run an eval from the Reactor Core panel above to resolve them now.
            </Tip>
          </p>
        </div>
      </Panel>

      {/* ── Achievement log ────────────────────────────────────────────── */}
      <Panel
        title="ACHIEVEMENT LOG"
        right={`${unlocked.length} / ${ACHIEVEMENTS.length}`}
      >
        {/* Recent unlocks spotlighted */}
        {recentUnlocks.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3 border-b border-edge pb-4">
            {recentUnlocks.map((a, i) => (
              <div
                key={a.id}
                className="flex flex-col items-center gap-1 border bg-panel2/40 px-4 py-3 text-center"
                style={{ borderColor: a.color + "55" }}
              >
                <span style={{ animationDelay: `${i * 120}ms` }} className="anim-badge-pop inline-flex">
                  <AchievementBadge color={a.color} unlocked size={46} />
                </span>
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
                <div className="flex min-w-0 items-center gap-2.5">
                  <AchievementBadge color={a.color} unlocked={has} size={30} />
                  <div className="min-w-0">
                    <span
                      className="block text-[0.78rem] uppercase tracking-term"
                      style={{ color: has ? a.color : "#454552" }}
                    >
                      {a.name}
                    </span>
                    <span className={`block text-[0.63rem] ${has ? "text-muted" : "text-faint/60"}`}>
                      {a.description}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 text-[0.62rem] uppercase tracking-term ${has ? "text-faint" : "text-faint/40"}`}>
                  +{a.xp} XP
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-center gap-4">
          <Link href="/" className="btn text-[0.65rem]">» overview</Link>
          <Link href="/rank?dev=1" className="text-[0.6rem] uppercase tracking-term text-faint/50 hover:text-accent2">
            [ dev previewer ]
          </Link>
        </div>
      </Panel>

      {/* ── Dev mode: reactor previewer (/rank?dev=1) ──────────────────── */}
      {devMode && (
        <Panel title="DEV · REACTOR PREVIEWER" right={
          <span className="text-[0.62rem] uppercase tracking-term text-amber">[DEV MODE]</span>
        }>
          <p className="mb-3 text-[0.68rem] text-muted">
            All 11 output tiers. Use controls to preview danger state and XP progress.
            Access: <code className="text-faint">/rank?dev=1</code>
          </p>
          <ReactorDevPanel />
        </Panel>
      )}
    </main>
  );
}
