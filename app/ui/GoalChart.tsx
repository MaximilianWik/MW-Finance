import { kr } from "@/lib/format";
import { addMonths } from "@/lib/goal-math";

/**
 * Projection chart, terminal style. One point per month from today.
 *   pace (muted)   = current pace
 *   sim  (accent)  = simulated pace (only when it differs)
 *   dashed line    = target; dotted vertical = target date
 */
export function GoalChart({
  pace,
  sim,
  target,
  today,
  targetMonth,
}: {
  pace: number[];
  sim?: number[] | null;
  target: number;
  today: string;
  targetMonth?: number | null; // months from today to the target date
}) {
  const W = 600;
  const H = 170;
  const PAD = { l: 8, r: 8, t: 12, b: 22 };
  const months = Math.max(pace.length, sim?.length ?? 0) - 1;
  if (months < 1) return null;

  const maxY = Math.max(target * 1.05, ...pace, ...(sim ?? []));
  const x = (m: number) => PAD.l + (m / months) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const line = (vals: number[]) => vals.map((v, m) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const year = (m: number) => addMonths(today, m).slice(0, 4);

  // Year ticks: every 12 months, at most ~8 labels.
  const step = Math.max(12, Math.ceil(months / 8 / 12) * 12);
  const ticks: number[] = [];
  for (let m = 0; m <= months; m += step) ticks.push(m);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Goal projection">
      {/* target */}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#e8c545" strokeDasharray="4 4" strokeWidth="1" />
      <text x={W - PAD.r} y={y(target) - 4} textAnchor="end" fontSize="10" fill="#e8c545">
        target {kr(target)}
      </text>

      {/* target date */}
      {targetMonth != null && targetMonth > 0 && targetMonth <= months && (
        <>
          <line x1={x(targetMonth)} x2={x(targetMonth)} y1={PAD.t} y2={H - PAD.b} stroke="#e85252" strokeDasharray="2 3" strokeWidth="1" />
          <text x={x(targetMonth) + 3} y={PAD.t + 8} fontSize="10" fill="#e85252">target date</text>
        </>
      )}

      <polyline points={line(pace)} fill="none" stroke="#72728a" strokeWidth="1.5" />
      {sim && <polyline points={line(sim)} fill="none" stroke="#4ec96a" strokeWidth="2" />}

      {/* x axis */}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#2a2a33" strokeWidth="1" />
      {ticks.map((m) => (
        <text key={m} x={x(m)} y={H - 6} fontSize="10" fill="#72728a" textAnchor={m === 0 ? "start" : "middle"}>
          {m === 0 ? "now" : year(m)}
        </text>
      ))}
    </svg>
  );
}
