import { kr } from "@/lib/format";
import type { XpInputs } from "@/lib/game/level";
import {
  XP_PER_100_KR, XP_PER_100_KR_INVEST,
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

function bar(frac: number, color: string) {
  const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <div className="mt-0.5 h-1 w-full overflow-hidden bg-edge">
      <div className="anim-bar h-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function XpBreakdown({ inputs }: { inputs: XpInputs }) {
  const savXp    = Math.floor(inputs.savingsTotal     / 100) * XP_PER_100_KR;
  const invXp    = Math.floor(inputs.investmentsTotal / 100) * XP_PER_100_KR_INVEST;
  const strXp    = computeStreakXp(inputs.bestStreak);
  const achXp    = inputs.achievementXp;
  const chalXp   = inputs.challengeXp;
  const budgXp   = inputs.budgetXp;
  const total    = savXp + invXp + strXp + achXp + chalXp + budgXp;

  const d         = inputs.bestStreak;
  const rate      = streakDailyRate(d);
  const nextBlock = d + 1; // rate increases every single day now
  const nextRate  = rate + XP_STREAK_STEP;

  const strDetail = d > 0
    ? `${d}d × ${rate} XP/d · +${XP_STREAK_STEP} XP/d every day`
    : `${XP_STREAK_BASE} XP/day base · +${XP_STREAK_STEP}/day per day of streak`;
  const strSub = d > 0
    ? `tomorrow (day ${d + 1}): rate rises to ${nextRate} XP/d`
    : undefined;

  const budgSurplus = budgXp > 0
    ? `${((budgXp / XP_BUDGET_PER_100_KR) * 100).toLocaleString("sv-SE")} kr saved under budget`
    : "no completed salary cycles under budget yet";

  const rows: Row[] = [
    { label: "Investments",
      detail: `${kr(inputs.investmentsTotal)} × ${XP_PER_100_KR_INVEST}/100 kr · primary driver`,
      xp: invXp, color: "#5cc8e8" },
    { label: "Savings",
      detail: `${kr(inputs.savingsTotal)} × ${XP_PER_100_KR}/100 kr · reserve track`,
      xp: savXp, color: "#3ec8b0" },
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
        XP is derived live. Investing is the primary driver at{" "}
        <span className="text-accent2">{XP_PER_100_KR_INVEST} XP per 100 kr</span> deployed;
        savings is the reserve track at {XP_PER_100_KR} XP per 100 kr. Streak compounds: rate
        starts at {XP_STREAK_BASE} XP/day and adds{" "}
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

      {rows.filter((r) => r.xp > 0).map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-term">
            <span style={{ color: r.color }}>{r.label}</span>
            <span className="text-faint">{total > 0 ? Math.round((r.xp / total) * 100) : 0}%</span>
          </div>
          {bar(total > 0 ? r.xp / total : 0, r.color)}
        </div>
      ))}
    </div>
  );
}
