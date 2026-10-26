import { kr } from "@/lib/format";
import type { XpInputs } from "@/lib/game/level";
import type { BudgetCheck } from "@/lib/game/snapshot";
import {
  XP_PER_100_KR_INVEST,
  XP_STREAK_BASE, XP_STREAK_STEP, XP_BUDGET_PER_100_KR,
  streakDailyRate, computeStreakXp,
} from "@/lib/game/level";

interface Row {
  label: string;
  detail: string;
  sub?: string;
  xp: number;
  color: string;
}

export function XpBreakdown({
  inputs,
  currentStreak,
  budgetCheck,
}: {
  inputs: XpInputs;
  currentStreak: number;
  budgetCheck: BudgetCheck | null;
}) {
  const invXp    = Math.floor(inputs.investmentsTotal / 100) * XP_PER_100_KR_INVEST;
  const strXp    = computeStreakXp(inputs.bestStreak);
  const achXp    = inputs.achievementXp;
  const chalXp   = inputs.challengeXp;
  const budgXp   = inputs.budgetXp;
  const total    = invXp + strXp + achXp + chalXp + budgXp;

  // Uptime XP is banked on the BEST streak; the current run only adds once it
  // passes the best.
  const d        = inputs.bestStreak;
  const rate     = streakDailyRate(d);
  const nextRate = rate + XP_STREAK_STEP;
  const cur      = currentStreak;

  const strDetail = d > 0
    ? `best ${d}d × ${rate} XP/d · +${XP_STREAK_STEP} XP/d every day`
    : `${XP_STREAK_BASE} XP/day base · +${XP_STREAK_STEP}/day per day of streak`;
  const strSub = d === 0
    ? undefined
    : cur >= d
      ? `current run is your best · tomorrow (day ${d + 1}): rate rises to ${nextRate} XP/d`
      : `current run ${cur}d = ${computeStreakXp(cur).toLocaleString("sv-SE")} XP · adds XP once it passes ${d}d (in ${d - cur + 1}d)`;

  const fmt = (n: number) => n.toLocaleString("sv-SE");
  const lastCycle = !budgetCheck
    ? "no completed salary cycle yet"
    : budgetCheck.spent > budgetCheck.budget
      ? `last cycle ${budgetCheck.label}: ${kr(budgetCheck.spent)} / ${kr(budgetCheck.budget)}, over by ${kr(budgetCheck.spent - budgetCheck.budget)}, no XP`
      : budgetCheck.evaluated
        ? `last cycle ${budgetCheck.label}: under by ${kr(budgetCheck.budget - budgetCheck.spent)}, +${fmt(budgetCheck.xp)} XP awarded`
        : `last cycle ${budgetCheck.label}: under by ${kr(budgetCheck.budget - budgetCheck.spent)} → +${fmt(budgetCheck.xp)} XP at next eval`;
  const budgSurplus = budgXp > 0
    ? `${fmt((budgXp / XP_BUDGET_PER_100_KR) * 100)} kr saved under budget so far · ${lastCycle}`
    : lastCycle;

  const rows: Row[] = [
    { label: "Investments",
      detail: `${kr(inputs.investmentsTotal)} × ${XP_PER_100_KR_INVEST}/100 kr · sole capital driver`,
      xp: invXp, color: "#5cc8e8" },
    { label: "Uptime",
      detail: strDetail,
      sub: strSub,
      xp: strXp, color: "#4ec96a" },
    { label: "Budget",
      detail: `${XP_BUDGET_PER_100_KR} XP per 100 kr under budget at cycle end`,
      sub: budgSurplus,
      xp: budgXp, color: "#e8c545" },
    { label: "Achievements",
      detail: "sum of unlocked badges",
      xp: achXp, color: "#e8c545" },
    { label: "Challenges",
      detail: "sum of cleared directives",
      xp: chalXp, color: "#c080e0" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.7rem] text-muted">
        XP is derived live. Investing is the sole capital driver at{" "}
        <span className="text-accent2">{XP_PER_100_KR_INVEST} XP per 100 kr</span> deployed.
        Streak compounds: rate starts at {XP_STREAK_BASE} XP/day and adds{" "}
        <span className="text-accent">+{XP_STREAK_STEP} XP/day</span> for every day of
        containment. Finishing a salary cycle under total budget adds{" "}
        <span className="text-accent2">{XP_BUDGET_PER_100_KR} XP per 100 kr</span> saved.
      </p>
      <table className="w-full text-[0.72rem]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-grid last:border-0">
              <td className="py-1.5 pr-3 uppercase tracking-term" style={{ color: r.color }}>
                {r.label}
              </td>
              <td className="py-1.5 pr-4 text-faint">
                {r.detail}
                {r.sub && (
                  <span className="ml-1 text-[0.6rem] text-faint/70"> · {r.sub}</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums text-ink2">
                {r.xp.toLocaleString("sv-SE")} XP
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-edge">
            <td className="pt-2 uppercase tracking-term text-muted" colSpan={2}>Total</td>
            <td className="pt-2 text-right tabular-nums font-bold text-accent">
              {total.toLocaleString("sv-SE")} XP
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
