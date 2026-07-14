"use client";

import { useState } from "react";
import { ReactorCore } from "./ReactorCore";
import { TIERS } from "@/lib/game/level";

/**
 * Dev-mode reactor previewer. Shows all 8 output tiers simultaneously with
 * interactive controls. Accessible at /rank?dev=1.
 */
export function ReactorDevPanel() {
  const [danger,   setDanger]   = useState(false);
  const [progress, setProgress] = useState(0.5);
  const [size,     setSize]     = useState(140);

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 border border-edge bg-panel2 px-3 py-2 text-[0.68rem] uppercase tracking-term">
        <span className="text-accent2">$ dev controls</span>

        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={danger}
            onChange={(e) => setDanger(e.target.checked)}
            className="accent-danger"
          />
          <span className={danger ? "text-danger" : "text-muted"}>
            [!] danger / breach
          </span>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-muted">progress</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-24 accent-accent"
          />
          <span className="w-8 tabular-nums text-faint">{Math.round(progress * 100)}%</span>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-muted">size</span>
          <input
            type="range"
            min="80"
            max="220"
            step="10"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-20 accent-accent"
          />
          <span className="w-10 tabular-nums text-faint">{size}px</span>
        </label>
      </div>

      {/* Tier grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIERS.map((tier, i) => {
          const hue = danger ? "#e85252" : tier.color;
          return (
            <div
              key={tier.name}
              className="flex flex-col items-center gap-2 border border-edge bg-panel px-3 py-4"
              style={{ borderColor: hue + "33" }}
            >
              {/* Color swatch */}
              <span
                className="mb-1 h-1 w-full"
                style={{ background: hue }}
              />

              <ReactorCore
                tierIndex={i}
                color={tier.color}
                progress={progress}
                danger={danger}
                size={size}
                uid={`dev${i}`}
              />

              {/* Label */}
              <span
                className="text-[0.75rem] font-bold uppercase tracking-term"
                style={{ color: hue }}
              >
                {tier.name}
              </span>

              {/* Blurb */}
              <span className="max-w-[10rem] text-center text-[0.6rem] leading-relaxed text-faint">
                {tier.blurb}
              </span>

              {/* Threshold */}
              <span className="text-[0.58rem] tabular-nums text-faint/60">
                {tier.minXp.toLocaleString("sv-SE")} XP
              </span>

              {/* Progress bar to next tier */}
              <div className="h-1 w-full overflow-hidden bg-edge">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background: hue,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tier metadata table */}
      <table className="term-table text-[0.68rem]">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Min XP</th>
            <th>Color</th>
            <th>Blurb</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((tier) => (
            <tr key={tier.name}>
              <td style={{ color: tier.color }} className="font-bold uppercase tracking-term">
                {tier.name}
              </td>
              <td className="tabular-nums">{tier.minXp.toLocaleString("sv-SE")}</td>
              <td>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-6 shrink-0"
                    style={{ background: tier.color }}
                  />
                  <span className="font-mono text-faint">{tier.color}</span>
                </span>
              </td>
              <td className="text-faint">{tier.blurb}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
