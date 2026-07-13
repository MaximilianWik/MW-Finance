import type { CSSProperties } from "react";

interface Props {
  tierIndex: number;   // 0..7
  color: string;       // tier hue
  progress: number;    // 0..1 toward next tier
  danger?: boolean;    // containment breach → destabilized
  size?: number;
}

const C = 100; // viewBox centre
const DANGER = "#e85252";

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * The reactor core. A layered SVG whose intensity scales with the output tier:
 * a cold dim ember at the bottom, a multi-ring pulsing fusion core with
 * orbiting particles and phosphor bloom near the top. On a containment breach
 * it destabilises: red hue, warning ring, flicker. Honours reduced-motion.
 */
export function ReactorCore({ tierIndex, color, progress, danger = false, size = 220 }: Props) {
  const hue = danger ? DANGER : color;
  const t = Math.max(0, Math.min(7, tierIndex));

  // Intensity knobs, all derived from the tier.
  const ringCount = 1 + Math.min(4, t);
  const outerParticles = t;                 // 0 at COLD → 7 at SINGULARITY
  const innerParticles = Math.max(0, t - 2);
  const spin = `${28 - t * 2.4}s`;
  const spinRev = `${34 - t * 2.8}s`;
  const pulse = `${(3.4 - t * 0.28).toFixed(2)}s`;
  const orbit = `${(18 - t * 1.6).toFixed(2)}s`;
  const bloomDur = `${(4 - t * 0.3).toFixed(2)}s`;
  const coreGlow = 0.35 + t * 0.09;

  const progC = 2 * Math.PI * 86;
  const anim = danger ? "reactor-flicker 1.4s steps(2, jump-none) infinite" : undefined;

  const spinStyle = (dur: string, rev = false): CSSProperties => ({
    animation: `${rev ? "reactor-spin-rev" : "reactor-spin"} ${dur} linear infinite`,
  });

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Reactor core, tier ${tierIndex}`}
      style={{ animation: anim, maxWidth: "100%" }}
    >
      <defs>
        <radialGradient id={`rc-core-${tierIndex}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffef2" stopOpacity="0.95" />
          <stop offset="35%" stopColor={hue} stopOpacity="0.95" />
          <stop offset="100%" stopColor={hue} stopOpacity="0.05" />
        </radialGradient>
        <radialGradient id={`rc-halo-${tierIndex}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={hue} stopOpacity={coreGlow} />
          <stop offset="70%" stopColor={hue} stopOpacity="0.06" />
          <stop offset="100%" stopColor={hue} stopOpacity="0" />
        </radialGradient>
        <filter id={`rc-bloom-${tierIndex}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={2 + t * 0.7} />
        </filter>
      </defs>

      {/* Phosphor halo */}
      <circle cx={C} cy={C} r="96" fill={`url(#rc-halo-${tierIndex})`}
        style={{ animation: `reactor-bloom ${bloomDur} ease-in-out infinite` }} />

      {/* Progress-to-next-tier arc */}
      <circle cx={C} cy={C} r="86" fill="none" stroke="#252530" strokeWidth="1.5" />
      <circle
        cx={C} cy={C} r="86" fill="none" stroke={hue} strokeWidth="2.5"
        strokeLinecap="round" strokeDasharray={progC}
        strokeDashoffset={progC * (1 - Math.max(0, Math.min(1, progress)))}
        transform={`rotate(-90 ${C} ${C})`} opacity="0.85"
      />

      {/* Containment rings */}
      {Array.from({ length: ringCount }).map((_, i) => {
        const r = 50 + i * 8;
        const rev = i % 2 === 1;
        return (
          <g key={`ring-${i}`} className="reactor-anim" style={spinStyle(rev ? spinRev : spin, rev)}>
            <circle
              cx={C} cy={C} r={r} fill="none" stroke={hue}
              strokeWidth={i === 0 ? 1.4 : 0.9}
              strokeDasharray={`${6 + i * 4} ${10 + i * 3}`}
              opacity={0.18 + i * 0.12}
            />
          </g>
        );
      })}

      {/* Warning ring on breach */}
      {danger && (
        <g className="reactor-anim" style={spinStyle("6s")}>
          <circle cx={C} cy={C} r="72" fill="none" stroke={DANGER}
            strokeWidth="2" strokeDasharray="3 9" opacity="0.9" />
        </g>
      )}

      {/* Orbiting particles */}
      {outerParticles > 0 && (
        <g className="reactor-anim" style={spinStyle(orbit)}>
          {Array.from({ length: outerParticles }).map((_, i) => {
            const [x, y] = polar(C, C, 64, (360 / outerParticles) * i);
            return <circle key={`op-${i}`} cx={x} cy={y} r={1.8 + t * 0.15} fill={hue}
              opacity="0.9" filter={`url(#rc-bloom-${tierIndex})`} />;
          })}
        </g>
      )}
      {innerParticles > 0 && (
        <g className="reactor-anim" style={spinStyle(`${(orbit)}`, true)}>
          {Array.from({ length: innerParticles }).map((_, i) => {
            const [x, y] = polar(C, C, 44, (360 / innerParticles) * i + 20);
            return <circle key={`ip-${i}`} cx={x} cy={y} r="1.5" fill="#fffef2" opacity="0.85" />;
          })}
        </g>
      )}

      {/* Core */}
      <g style={{ animation: `reactor-pulse ${pulse} ease-in-out infinite`, transformBox: "view-box", transformOrigin: "100px 100px" }}>
        <circle cx={C} cy={C} r="34" fill={hue} opacity="0.5" filter={`url(#rc-bloom-${tierIndex})`} />
        <circle cx={C} cy={C} r="26" fill={`url(#rc-core-${tierIndex})`} />
        {t >= 3 && <circle cx={C} cy={C} r="9" fill="#fffef2" opacity="0.95" />}
      </g>
    </svg>
  );
}
