"use client";

import { useRef, useState } from "react";
import { kr } from "@/lib/format";
import { addMonths, fmtMonthYear } from "@/lib/goal-math";

const W = 800;
const H = 340;
const PAD = { l: 64, r: 16, t: 16, b: 28 };

/**
 * Interactive projection chart. One point per month from today.
 *   pace (grey)   = current pace
 *   sim  (green)  = simulated pace (only when it differs)
 * Grid lines sit on the 25/50/75/100% milestones. Hover or drag for a
 * per-month readout (balance, deposits vs return, gap to target).
 */
export function GoalChart({
  pace,
  sim,
  paceMonthly,
  simMonthly,
  target,
  today,
  targetMonth,
}: {
  pace: number[];
  sim?: number[] | null;
  paceMonthly: number;
  simMonthly?: number;
  target: number;
  today: string;
  targetMonth?: number | null; // months from today to the target date
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const months = Math.max(pace.length, sim?.length ?? 0) - 1;
  if (months < 1) return null;

  const start = pace[0] ?? 0;
  const maxY = target * 1.15; // lines past this are clipped at the top
  const x = (m: number) => PAD.l + (m / months) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(Math.max(v, 0), maxY) / maxY) * (H - PAD.t - PAD.b);
  const line = (vals: number[]) => vals.map((v, m) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (vals: number[]) => `${x(0)},${y(0)} ${line(vals)} ${x(vals.length - 1)},${y(0)}`;
  const reach = (vals: number[] | null | undefined) => {
    const i = vals?.findIndex((v) => v >= target) ?? -1;
    return i > 0 ? i : null;
  };
  const paceReach = reach(pace);
  const simReach = reach(sim);

  // Year ticks: every 12 months (or a multiple), at most ~8 labels.
  const step = months <= 24 ? 6 : Math.max(12, Math.ceil(months / 8 / 12) * 12);
  const ticks: number[] = [];
  for (let m = 0; m <= months; m += step) ticks.push(m);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((e.clientX - box.left) / box.width) * W;
    const m = Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * months);
    setHover(Math.max(0, Math.min(months, m)));
  }

  const h = hover;
  const readout = (vals: number[] | null | undefined, monthly: number) => {
    if (h == null || !vals || vals[h] == null) return null;
    const bal = vals[h];
    const deposits = monthly * h;
    return { bal, deposits, ret: bal - start - deposits, gap: target - bal };
  };
  const rp = readout(pace, paceMonthly);
  const rs = sim ? readout(sim, simMonthly ?? paceMonthly) : null;
  const leftSide = h != null && h > months / 2;

  return (
    <div className="relative select-none">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Goal projection chart"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="simFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4ec96a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4ec96a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="paceFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#72728a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#72728a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* milestone grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(target * f)} y2={y(target * f)} stroke="#2a2a33" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(target * f) + 3} textAnchor="end" fontSize="10" fill="#72728a">
              {Math.round(f * 100)}% · {Math.round((target * f) / 1000)}k
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#e8c545" strokeDasharray="5 4" strokeWidth="1.2" />
        <text x={PAD.l - 6} y={y(target) + 3} textAnchor="end" fontSize="10" fill="#e8c545">
          {Math.round(target / 1000)}k
        </text>

        {/* target date */}
        {targetMonth != null && targetMonth > 0 && targetMonth <= months && (
          <>
            <line x1={x(targetMonth)} x2={x(targetMonth)} y1={PAD.t} y2={H - PAD.b} stroke="#e85252" strokeDasharray="2 3" strokeWidth="1" />
            <text x={x(targetMonth) + 4} y={PAD.t + 10} fontSize="10" fill="#e85252">
              finish by
            </text>
          </>
        )}

        {/* lines */}
        <polygon points={area(pace)} fill="url(#paceFill)" />
        <polyline points={line(pace)} fill="none" stroke="#72728a" strokeWidth="1.5" />
        {sim && (
          <>
            <polygon points={area(sim)} fill="url(#simFill)" />
            <polyline points={line(sim)} fill="none" stroke="#4ec96a" strokeWidth="2.2" />
          </>
        )}

        {/* reach markers */}
        {paceReach != null && (
          <g>
            <circle cx={x(paceReach)} cy={y(target)} r="4" fill="#0d0d10" stroke="#72728a" strokeWidth="1.5" />
            <text x={x(paceReach)} y={y(target) - 9} textAnchor="middle" fontSize="10" fill="#72728a">
              {fmtMonthYear(addMonths(today, paceReach))}
            </text>
          </g>
        )}
        {simReach != null && (
          <g>
            <circle cx={x(simReach)} cy={y(target)} r="4.5" fill="#0d0d10" stroke="#4ec96a" strokeWidth="2" />
            <text x={x(simReach)} y={y(target) - 9} textAnchor="middle" fontSize="11" fill="#4ec96a">
              {fmtMonthYear(addMonths(today, simReach))}
            </text>
          </g>
        )}

        {/* start */}
        <circle cx={x(0)} cy={y(start)} r="3" fill="#5ac8e8" />
        <text x={x(0) + 7} y={y(start) - 6} fontSize="10" fill="#5ac8e8">
          now {kr(start)}
        </text>

        {/* x axis */}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#3a3a45" strokeWidth="1" />
        {ticks.map((m) => (
          <text key={m} x={x(m)} y={H - 9} fontSize="10" fill="#72728a" textAnchor={m === 0 ? "start" : "middle"}>
            {m === 0 ? "now" : step < 12 ? fmtMonthYear(addMonths(today, m)) : addMonths(today, m).slice(0, 4)}
          </text>
        ))}

        {/* crosshair */}
        {h != null && (
          <g pointerEvents="none">
            <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} stroke="#e8e8f0" strokeOpacity="0.35" strokeWidth="1" />
            {rp && <circle cx={x(h)} cy={y(rp.bal)} r="3.5" fill="#72728a" />}
            {rs && <circle cx={x(h)} cy={y(rs.bal)} r="4" fill="#4ec96a" />}
          </g>
        )}
      </svg>

      {h != null && (rp || rs) && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[12rem] border border-edge2 bg-ink/95 px-3 py-2 text-[0.7rem] tabular-nums shadow-lg"
          style={leftSide ? { right: `${100 - (x(h) / W) * 100 + 1.5}%` } : { left: `${(x(h) / W) * 100 + 1.5}%` }}
        >
          <p className="mb-1 uppercase tracking-term text-faint">
            {fmtMonthYear(addMonths(today, h))} · month {h}
          </p>
          {rs && <Readout label="simulated" tone="text-accent" r={rs} />}
          {rp && <Readout label="current pace" tone="text-muted" r={rp} />}
        </div>
      )}
    </div>
  );
}

function Readout({
  label,
  tone,
  r,
}: {
  label: string;
  tone: string;
  r: { bal: number; deposits: number; ret: number; gap: number };
}) {
  return (
    <div className="mb-1 last:mb-0">
      <p className={`flex justify-between gap-3 ${tone}`}>
        <span className="uppercase tracking-term">{label}</span>
        <span>{kr(Math.round(r.bal))}</span>
      </p>
      <p className="flex justify-between gap-3 text-faint">
        <span>deposits +{kr(Math.round(r.deposits))}</span>
        {r.ret >= 1 && <span className="text-accent2">return +{kr(Math.round(r.ret))}</span>}
      </p>
      <p className="text-faint">{r.gap > 0 ? `${kr(Math.round(r.gap))} to go` : "target reached ✓"}</p>
    </div>
  );
}
