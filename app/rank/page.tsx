import Link from "next/link";
import { kr } from "@/lib/format";
import { getReactorSnapshot } from "@/lib/game/snapshot";
import { getUnlocked, ACHIEVEMENTS } from "@/lib/game/achievements";
import { getActiveChallenges } from "@/lib/game/challenges";
import { TIERS } from "@/lib/game/level";
import { Panel } from "../ui/Panel";
import { ReactorCore } from "../ui/ReactorCore";
import { AiConsole } from "../ui/AiConsole";
import { QueryLog } from "../ui/QueryLog";
import { withQueryLog } from "@/db/query-log";

export const dynamic = "force-dynamic";

export default async function RankPage() {
  const t0 = Date.now();

  let snap: Awaited<ReturnType<typeof getReactorSnapshot>> | null = null;
  let unlocked: Awaited<ReturnType<typeof getUnlocked>> = [];
  let challenges: Awaited<ReturnType<typeof getActiveChallenges>> = [];
  let queryLog: { sql: string }[] = [];
  let dbError: string | null = null;

  try {
    const [[s, u, c], ql] = await withQueryLog(() =>
      Promise.all([getReactorSnapshot(), getUnlocked(), getActiveChallenges()])
    );
    snap = s; unlocked = u; challenges = c; queryLog = ql;
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

  const { level, streak, pot } = snap;
  const hue = level.danger ? "#e85252" : level.tier.color;
  const unlockedIds = new Set(unlocked.map((a) => a.id));

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="CORE" />

      {/* ── Core + tier ladder ─────────────────────────────────────────── */}
      <Panel title="REACTOR CORE" right={<span style={{ color: hue }}>{level.tier.name}</span>}>
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <ReactorCore
              tierIndex={level.index}
              color={level.tier.color}
              progress={level.progress}
              danger={level.danger}
              size={260}
            />
            <p className="max-w-[16rem] text-center text-[0.7rem] leading-relaxed text-muted">
              {level.danger ? "[!] Containment breach. Output destabilised. Get back under pace." : level.tier.blurb}
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

            {/* XP bar */}
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

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 border-t border-edge pt-3 text-center">
              <div>
                <div className="text-[0.62rem] uppercase tracking-term text-muted">uptime</div>
                <div className={`text-lg ${level.danger ? "text-danger" : "text-accent"}`}>
                  {level.danger ? "BREACH" : `${streak.current}d`}
                </div>
                <div className="text-[0.6rem] uppercase tracking-term text-faint">best {streak.best}d</div>
              </div>
              <div>
                <div className="text-[0.62rem] uppercase tracking-term text-muted">stored charge</div>
                <div className={`text-lg ${pot.discharging ? "text-danger" : "text-accent2"}`}>{kr(pot.charge)}</div>
                <div className="text-[0.6rem] uppercase tracking-term text-faint">pace {kr(pot.pace)}/day</div>
              </div>
            </div>

            {/* Tier ladder */}
            <div className="flex flex-col gap-1 border-t border-edge pt-3">
              {TIERS.map((tier, i) => {
                const reached = i <= level.index;
                const current = i === level.index;
                return (
                  <div
                    key={tier.name}
                    className={`flex items-center justify-between px-2 py-0.5 text-[0.7rem] uppercase tracking-term ${
                      current ? "bg-panel2" : ""
                    }`}
                  >
                    <span style={{ color: reached ? tier.color : "#454552" }}>
                      {current ? "» " : reached ? "· " : "  "}
                      {tier.name}
                    </span>
                    <span className={reached ? "text-faint" : "text-faint/60"}>
                      {tier.minXp.toLocaleString("sv-SE")} XP
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Weekly challenges ──────────────────────────────────────────── */}
      <Panel title="WEEKLY DIRECTIVES">
        {challenges.length === 0 ? (
          <p className="py-2 text-sm text-muted">No directives yet. Run an eval to generate this week&apos;s slate.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {challenges.map((c) => {
              const progress = Number(c.progress);
              const target = Number(c.target);
              const pct = target > 0 ? Math.min(1, progress / target) : 0;
              const barColor =
                c.status === "complete" ? "#4ec96a" : c.status === "failed" ? "#e85252" : "#5cc8e8";
              return (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[0.72rem] uppercase tracking-term">
                    <span className="text-ink2">{c.title}</span>
                    <span
                      className={
                        c.status === "complete" ? "text-accent"
                        : c.status === "failed" ? "text-danger"
                        : "text-faint"
                      }
                    >
                      {c.status === "complete" ? `[ CLEARED +${c.rewardXp} XP ]`
                        : c.status === "failed" ? "[ FAILED ]"
                        : c.lowerIsBetter ? `${kr(progress)} / ${kr(target)}`
                        : `${Math.floor(progress)} / ${Math.floor(target)}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden bg-edge">
                    <div className="h-full" style={{ width: `${Math.round(pct * 100)}%`, background: barColor }} />
                  </div>
                  <span className="text-[0.62rem] lowercase text-faint">{c.description} · +{c.rewardXp} XP</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 border-t border-edge pt-3">
          <p className="mb-2 text-[0.7rem] leading-relaxed text-muted">
            The reactor re-evaluates nightly after each sync. Trigger a manual eval to refresh
            uptime, resolve directives and unlock achievements now.
          </p>
          <AiConsole endpoint="/api/game/eval" label="$ run eval" pendingLabel="evaluating…" />
        </div>
      </Panel>

      {/* ── Achievements log ───────────────────────────────────────────── */}
      <Panel title="ACHIEVEMENT LOG" right={`${unlocked.length} / ${ACHIEVEMENTS.length}`}>
        <ul className="flex flex-col divide-y divide-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = unlockedIds.has(a.id);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span aria-hidden style={{ color: has ? a.color : "#454552" }}>
                      {has ? "◆" : "◇"}
                    </span>
                    <span
                      className="truncate text-[0.8rem] uppercase tracking-term"
                      style={{ color: has ? a.color : "#454552" }}
                    >
                      {a.name}
                    </span>
                  </div>
                  <span className={`block text-[0.65rem] ${has ? "text-muted" : "text-faint/70"}`}>
                    {a.description}
                  </span>
                </div>
                <span className={`shrink-0 text-[0.62rem] uppercase tracking-term ${has ? "text-faint" : "text-faint/50"}`}>
                  {has ? `+${a.xp} XP` : "locked"}
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
