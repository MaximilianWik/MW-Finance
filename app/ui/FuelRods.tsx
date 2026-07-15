"use client";

import { useState } from "react";
import { kr } from "@/lib/format";
import type { DayRecord } from "@/lib/game/history";

// ─── Geometry (SVG viewBox units) ─────────────────────────────────────────────
const RW = 11;          // rod width
const GAP = 4;
const STRIDE = RW + GAP;
const PAD_X = 16;
const PAD_TOP = 18;
const ROD_MAX_H = 128;  // full-containment column height
const BASE_H = 16;      // coolant pool band
const BASE_Y = PAD_TOP + ROD_MAX_H;
const PACE_FRAC = 0.16; // min-containment threshold line, as fraction of ROD_MAX_H
const MAX_RODS = 42;

type RodState = "nospend" | "under" | "breach" | "empty";

interface Rod {
  rec: DayRecord;
  state: RodState;
  fill: number;   // 0..1 rendered column fraction
}

const FILL: Record<RodState, string> = {
  nospend: "url(#rodCyan)",
  under:   "url(#rodGreen)",
  breach:  "url(#rodRed)",
  empty:   "#16161c",
};

const READOUT_COLOR: Record<RodState, string> = {
  nospend: "#5cc8e8",
  under:   "#4ec96a",
  breach:  "#e85252",
  empty:   "#454552",
};

function classify(r: DayRecord, today: string): Rod {
  if (!r.date || r.date > today) return { rec: r, state: "empty", fill: 0 };
  if (r.breach)  return { rec: r, state: "breach",  fill: PACE_FRAC * 0.85 }; // hot stub below the line
  if (r.noSpend) return { rec: r, state: "nospend", fill: 1 };
  const margin = r.pace > 0 ? Math.max(0, Math.min(1, (r.pace - r.spend) / r.pace)) : 0;
  return { rec: r, state: "under", fill: Math.max(0.14, margin) };
}

function dayLabel(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

function readout(rod: Rod): string {
  const { rec, state } = rod;
  if (state === "empty") return `${rec.date ? dayLabel(rec.date) : "—"} · no data`;
  const label = dayLabel(rec.date);
  if (state === "breach")  return `${label} · BREACH +${kr(rec.spend - rec.pace)} over pace`;
  if (state === "nospend") return `${label} · no spend · CONTAINED`;
  return `${label} · ${kr(rec.spend)} of ${kr(rec.pace)} pace · CONTAINED`;
}

/**
 * Reactor fuel-rod bank: the last 42 days rendered as glowing vertical fuel rods
 * inside a containment vessel. Column height = containment margin (headroom under
 * daily pace). Full cyan = zero spend, green = under pace, red hot stub = breach.
 * Hover or tap a rod for its detail readout; click pins it.
 */
export function FuelRods({
  records,
  currentStreak,
  bestStreak,
  pace,
}: {
  records: DayRecord[];
  currentStreak: number;
  bestStreak: number;
  pace: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const rods = records.filter((r) => !!r.date).slice(-MAX_RODS).map((r) => classify(r, today));
  const N = rods.length;

  const bankW = N > 0 ? N * STRIDE - GAP : 0;
  const svgW = bankW + PAD_X * 2;
  const svgH = BASE_Y + BASE_H + 4;
  const paceY = BASE_Y - PACE_FRAC * ROD_MAX_H;

  const pastRecords = records.filter((r) => !!r.date && r.date <= today);
  const cleanCount  = pastRecords.filter((r) => r.clean).length;
  const breachCount = pastRecords.filter((r) => r.breach).length;

  const activeIdx = pinned ?? hovered;
  const active = activeIdx != null ? rods[activeIdx] : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Headline: uptime + daily pace */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tabular-nums text-accent">
          {currentStreak}<span className="ml-1 text-sm font-normal text-muted">d uptime</span>
        </span>
        {bestStreak > currentStreak && (
          <span className="text-sm text-faint">best {bestStreak}d</span>
        )}
        <span className="ml-auto flex items-baseline gap-1 text-[0.65rem] uppercase tracking-term">
          <span className="text-faint">daily pace</span>
          <span className="tabular-nums text-accent2">{kr(pace)}</span>
          <span className="text-faint">/day</span>
        </span>
      </div>

      {/* Live detail readout */}
      <div className="flex min-h-[1.4rem] items-center justify-between border-y border-grid py-1 text-[0.7rem] uppercase tracking-term">
        {active ? (
          <span style={{ color: READOUT_COLOR[active.state] }}>{readout(active)}</span>
        ) : (
          <span className="text-faint/70">hover a rod for detail · click to pin</span>
        )}
        <span className="ml-auto text-[0.6rem] text-faint/60">
          {pinned != null ? "[ pinned · click again to release ]" : `last ${N} days`}
        </span>
      </div>

      {/* Rod bank */}
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ maxHeight: svgH * 1.6, display: "block" }}
        aria-label={`${N}-day fuel-rod containment log`}
      >
        <defs>
          <linearGradient id="rodCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fe6ff" /><stop offset="100%" stopColor="#2a8fb0" />
          </linearGradient>
          <linearGradient id="rodGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#78e492" /><stop offset="100%" stopColor="#286f3d" />
          </linearGradient>
          <linearGradient id="rodRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff9a4a" /><stop offset="100%" stopColor="#b81f1f" />
          </linearGradient>
          <linearGradient id="coolant" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a8fb0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0e2a36" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Vessel base coolant pool */}
        <rect
          className="coolant-band"
          x={PAD_X - 4} y={BASE_Y} width={bankW + 8} height={BASE_H} rx={3}
          fill="url(#coolant)"
        />

        {/* Min-containment pace line */}
        <line
          x1={PAD_X - 4} y1={paceY} x2={PAD_X + bankW + 4} y2={paceY}
          stroke="#5a6b7a" strokeWidth={1} strokeDasharray="4 4" opacity={0.7}
        />
        <text x={PAD_X - 4} y={paceY - 3} fontSize="6.5" fill="#5a6b7a" fontFamily="monospace">
          MIN CONTAINMENT · PACE
        </text>

        {/* Rods */}
        {rods.map((rod, i) => {
          const x = PAD_X + i * STRIDE;
          const isActive = i === activeIdx;
          const h = rod.fill * ROD_MAX_H;
          const y = BASE_Y - h;
          const isBreach = rod.state === "breach";
          const isNoSpend = rod.state === "nospend";

          return (
            <g key={rod.rec.date || i}>
              {/* Rod housing / empty track */}
              <rect
                x={x} y={PAD_TOP} width={RW} height={ROD_MAX_H} rx={3}
                fill="#121218" stroke={isActive ? "#5cc8e8" : "#22222c"} strokeWidth={isActive ? 1.2 : 0.8}
              />

              {/* Fuel column */}
              {rod.state !== "empty" && h > 0 && (
                <rect
                  className={`anim-rod ${isBreach ? "rod-breach" : "rod-glow"}`}
                  x={x + 1} y={y} width={RW - 2} height={h} rx={2.5}
                  fill={FILL[rod.state]}
                  style={{ animationDelay: `${i * 22}ms` }}
                />
              )}

              {/* Dropped control-rod cap on breach */}
              {isBreach && (
                <rect
                  className="rod-cap"
                  x={x + 1} y={PAD_TOP + 2} width={RW - 2} height={5} rx={1.5}
                  fill="#e85252"
                />
              )}

              {/* Rising coolant bubbles on zero-spend rods */}
              {isNoSpend && [0, 1].map((b) => (
                <circle
                  key={b}
                  className="coolant-bubble"
                  cx={x + RW / 2 + (b === 0 ? -1.5 : 2)}
                  cy={y + 10 + b * 6}
                  r={1.3}
                  fill="#cdeeff"
                  style={{ animationDelay: `${i * 22 + b * 900}ms` }}
                />
              ))}

              {/* Full-height hit target */}
              <rect
                x={x} y={PAD_TOP} width={RW} height={ROD_MAX_H} fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((prev) => (prev === i ? null : prev))}
                onClick={() => setPinned((p) => (p === i ? null : i))}
              />
            </g>
          );
        })}
      </svg>

      {/* Legend + counts */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.62rem] uppercase tracking-term">
        {[
          { color: "#5cc8e8", label: "no spend" },
          { color: "#4ec96a", label: "under pace" },
          { color: "#e85252", label: "breach" },
          { color: "#16161c", label: "no data" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
            <span className="text-faint">{label}</span>
          </span>
        ))}
        <span className="ml-auto text-faint/70">{cleanCount} clean · {breachCount} breach</span>
      </div>
    </div>
  );
}
