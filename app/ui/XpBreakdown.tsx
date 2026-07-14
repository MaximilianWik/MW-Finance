import { kr } from "@/lib/format";
import type { XpInputs } from "@/lib/game/level";
import { XP_PER_100_KR, XP_PER_100_KR_INVEST, XP_PER_STREAK_DAY } from "@/lib/game/level";

interface Row {
  label: string;
  detail: string;
  xp: number;
  color: string;
}

function bar(frac: number, color: string) {
  const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <div className="mt-0.5 h-1 w-full overflow-hidden bg-edge">
      <div className="h-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/**
 * Breakdown of where the reactor's XP comes from. Helps the user understand
 * which levers to pull next.
 */
export function XpBreakdown({ inputs }: { inputs: XpInputs }) {
  const savXp    = Math.floor(inputs.savingsTotal     / 100) * XP_PER_100_KR;
  const invXp    = Math.floor(inputs.investmentsTotal / 100) * XP_PER_100_KR_INVEST;
  const strXp    = inputs.bestStreak * XP_PER_STREAK_DAY;
  const achXp    = inputs.achievementXp;
  const chalXp   = inputs.challengeXp;
  const total    = savXp + invXp + strXp + achXp + chalXp;

  const rows: Row[] = [
    { label: "Savings",      detail: `${kr(inputs.savingsTotal)} × ${XP_PER_100_KR}/100 kr`,       xp: savXp,  color: "#3ec8b0" },
    { label: "Investments",  detail: `${kr(inputs.investmentsTotal)} × ${XP_PER_100_KR_INVEST}/100 kr`, xp: invXp, color: "#5cc8e8" },
    { label: "Uptime",       detail: `${inputs.bestStreak} days × ${XP_PER_STREAK_DAY} XP/day`,    xp: strXp,  color: "#4ec96a" },
    { label: "Achievements", detail: "sum of unlocked badges",                                       xp: achXp,  color: "#e8c545" },
    { label: "Challenges",   detail: "sum of cleared directives",                                    xp: chalXp, color: "#c080e0" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.7rem] text-muted">
        XP is derived live from your data. Every krona saved, every day of uptime, every
        cleared directive feeds the reactor.
      </p>
      <table className="w-full text-[0.72rem]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-grid last:border-0">
              <td className="py-1.5 pr-3 uppercase tracking-term" style={{ color: r.color }}>
                {r.label}
              </td>
              <td className="py-1.5 pr-4 text-faint">{r.detail}</td>
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

      {/* Mini bars */}
      {rows.filter((r) => r.xp > 0).map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-term">
            <span style={{ color: r.color }}>{r.label}</span>
            <span className="text-faint">
              {total > 0 ? Math.round((r.xp / total) * 100) : 0}%
            </span>
          </div>
          {bar(total > 0 ? r.xp / total : 0, r.color)}
        </div>
      ))}
    </div>
  );
}
