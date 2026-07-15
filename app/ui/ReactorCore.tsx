import type { ReactNode } from "react";

/**
 * The reactor core. Eleven bespoke, escalating visuals; each tier is a wholly
 * different machine, growing larger, sharper and more violent:
 *
 *   0 COLD        dormant cold-iron sphere, inert
 *   1 EMBER       a single glowing ember, rising sparks
 *   2 IGNITION    flame catching, turbulent fire, spark jets
 *   3 STABLE      clean balanced green reactor, orderly orbits
 *   4 CRITICAL    high-yield amber, arcing energy, warning ticks
 *   5 OVERDRIVE   violent red plasma, lightning, shaking containment
 *   6 FUSION      blazing cyan-white star, corona rays, lens flare
 *   7 SINGULARITY a black hole with event horizon, streaming accretion disk
 *   8 QUASAR      black hole firing bipolar relativistic jets through spacetime
 *   9 BIG BANG    a universe igniting: expanding shockwaves, ejecta, genesis core
 *  10 OMNIVERSE   nested fractal realities, hue-shifting mandala, bubble universes
 *
 * Pure SVG + CSS animation. Honours prefers-reduced-motion (all animated
 * elements carry a reactor- class which the global reduced-motion rule freezes).
 */

const C = 100;
const DANGER = "#e85252";

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}
function hex(r: number): string {
  return [0, 60, 120, 180, 240, 300].map((d) => polar(r, d).join(",")).join(" ");
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface TierProps {
  color: string;
  progress: number;
  uid: string;
}

/** Thin perimeter progress-to-next-tier arc. */
function Arc({ r, color, progress }: { r: number; color: string; progress: number }) {
  const circ = 2 * Math.PI * r;
  return (
    <>
      <circle cx={C} cy={C} r={r} fill="none" stroke="#252530" strokeWidth="1.4" />
      <circle
        cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - clamp01(progress))}
        transform={`rotate(-90 ${C} ${C})`} opacity="0.8"
      />
    </>
  );
}

/** A rotating ring of dots. */
function Orbit({ r, n, dot, color, dur, rev, op = 0.9, start = 0 }: {
  r: number; n: number; dot: number; color: string; dur: number; rev?: boolean; op?: number; start?: number;
}) {
  return (
    <g className="reactor-anim" style={{ animation: `reactor-spin${rev ? "-rev" : ""} ${dur}s linear infinite` }}>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = polar(r, (360 / n) * i + start);
        return <circle key={i} cx={x} cy={y} r={dot} fill={color} opacity={op} />;
      })}
    </g>
  );
}

// ── 0 · COLD ────────────────────────────────────────────────────────────────
function Cold({ color, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-c`} cx="50%" cy="44%" r="58%">
          <stop offset="0%" stopColor="#2b333d" />
          <stop offset="70%" stopColor="#171d24" />
          <stop offset="100%" stopColor="#0b0e12" />
        </radialGradient>
      </defs>
      <polygon points={hex(80)} fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
      <polygon points={hex(64)} fill="none" stroke={color} strokeWidth="0.6" opacity="0.18" />
      <g className="reactor-anim" style={{ animation: "reactor-pulse 7s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="42" fill={`url(#${uid}-c)`} stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      </g>
      {/* inert fracture lines */}
      <g stroke={color} strokeWidth="0.8" opacity="0.22" fill="none" strokeLinejoin="round">
        <polyline points="100,60 107,88 92,104 110,132" />
        <polyline points="132,96 112,102 118,120" />
      </g>
      <circle cx={C} cy={C} r="4.5" fill={color} opacity="0.3" />
    </>
  );
}

// ── 1 · EMBER ─────────────────────────────────────────────────────────────
function Ember({ color, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe0b0" />
          <stop offset="42%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <circle cx={C} cy={C} r="44" fill={color} opacity="0.16" filter={`url(#${uid}-b)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 4.6s ease-in-out infinite" }} />
      <g className="reactor-anim" style={{ animation: "reactor-spin 28s linear infinite" }}>
        <circle cx={C} cy={C} r="56" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="4 11" opacity="0.3" />
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} className="reactor-anim" cx={100 + (i - 2) * 6} cy={108} r={1.5} fill="#ffcf8a"
          style={{ animation: `reactor-rise ${2.4 + i * 0.35}s ease-in ${i * 0.45}s infinite` }} />
      ))}
      <g className="reactor-anim" style={{ animation: "reactor-pulse 3.4s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="21" fill={`url(#${uid}-core)`} />
      </g>
      <circle cx={C} cy={C} r="5" fill="#fff0cf" opacity="0.85" />
    </>
  );
}

// ── 2 · IGNITION ─────────────────────────────────────────────────────────
function Ignition({ color, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="52%" r="50%">
          <stop offset="0%" stopColor="#fff1c0" />
          <stop offset="40%" stopColor="#ffb347" />
          <stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </radialGradient>
        <filter id={`${uid}-fire`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.03 0.06" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="11" />
        </filter>
        <filter id={`${uid}-b`} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <circle cx={C} cy={C} r="52" fill={color} opacity="0.2" filter={`url(#${uid}-b)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 3s ease-in-out infinite" }} />
      <g className="reactor-anim" style={{ animation: "reactor-spin 16s linear infinite" }}>
        <circle cx={C} cy={C} r="60" fill="none" stroke="#e8863a" strokeWidth="1" strokeDasharray="6 8" opacity="0.4" />
      </g>
      {/* spark jets */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 11s linear infinite" }}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * 45;
          const [x1, y1] = polar(32, a);
          const [x2, y2] = polar(50, a);
          return <line key={i} className="reactor-anim" x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#ffd27a" strokeWidth="1.6" strokeLinecap="round"
            style={{ animation: `reactor-arc ${1.5 + i * 0.12}s ease-in-out ${i * 0.1}s infinite` }} />;
        })}
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-flicker 0.9s steps(3, jump-none) infinite" }}>
        <circle cx={C} cy={C} r="27" fill={`url(#${uid}-core)`} filter={`url(#${uid}-fire)`} />
      </g>
      <circle cx={C} cy={C} r="8" fill="#fff3d0" />
    </>
  );
}

// ── 3 · STABLE ─────────────────────────────────────────────────────────────
function Stable({ color, progress, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#eafff0" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      <circle cx={C} cy={C} r="50" fill={color} opacity="0.14" filter={`url(#${uid}-b)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 4s ease-in-out infinite" }} />
      <Arc r={86} color={color} progress={progress} />
      {/* three orderly rings */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 22s linear infinite" }}>
        <circle cx={C} cy={C} r="66" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 14" opacity="0.4" />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-spin-rev 18s linear infinite" }}>
        <circle cx={C} cy={C} r="54" fill="none" stroke={color} strokeWidth="1" strokeDasharray="6 10" opacity="0.5" />
      </g>
      <Orbit r={66} n={8} dot={2} color={color} dur={22} />
      <Orbit r={42} n={5} dot={1.6} color="#fffef2" dur={14} rev start={18} op={0.85} />
      <g className="reactor-anim" style={{ animation: "reactor-pulse 3.2s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="26" fill={`url(#${uid}-core)`} />
      </g>
      <circle cx={C} cy={C} r="9" fill="#fffef2" opacity="0.95" />
    </>
  );
}

// ── 4 · CRITICAL ─────────────────────────────────────────────────────────
function Critical({ color, progress, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6d0" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.08" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <circle cx={C} cy={C} r="56" fill={color} opacity="0.2" filter={`url(#${uid}-b)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 2.4s ease-in-out infinite" }} />
      <Arc r={88} color={color} progress={progress} />
      {/* warning tick marks */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 30s linear infinite" }}>
        {Array.from({ length: 24 }, (_, i) => {
          const [x1, y1] = polar(74, i * 15);
          const [x2, y2] = polar(80, i * 15);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" opacity={i % 2 ? 0.3 : 0.6} />;
        })}
      </g>
      {/* energy arcs between rings */}
      <g>
        {Array.from({ length: 6 }, (_, i) => {
          const [x1, y1] = polar(38, i * 60);
          const [x2, y2] = polar(62, i * 60 + 22);
          return <line key={i} className="reactor-anim" x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#fff0b0" strokeWidth="1.3" strokeLinecap="round"
            style={{ animation: `reactor-arc ${1.1 + i * 0.13}s linear ${i * 0.09}s infinite` }} />;
        })}
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-spin 14s linear infinite" }}>
        <circle cx={C} cy={C} r="60" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 6" opacity="0.55" />
      </g>
      <Orbit r={48} n={10} dot={1.8} color={color} dur={9} />
      <g className="reactor-anim" style={{ animation: "reactor-throb 1.5s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="28" fill={`url(#${uid}-core)`} />
      </g>
      <circle cx={C} cy={C} r="10" fill="#fffbe6" />
    </>
  );
}

// ── 5 · OVERDRIVE ─────────────────────────────────────────────────────────
function Overdrive({ color, progress, uid }: TierProps) {
  const bolt = (a: number) => {
    const [x1, y1] = polar(30, a);
    const [mx, my] = polar(52, a + 8);
    const [x2, y2] = polar(74, a - 6);
    return `${x1},${y1} ${mx},${my} ${x2},${y2}`;
  };
  return (
    <g className="reactor-anim" style={{ animation: "reactor-shake 0.35s ease-in-out infinite" }}>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe8e0" />
          <stop offset="38%" stopColor="#ff6a4a" />
          <stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </radialGradient>
        <filter id={`${uid}-plasma`}>
          <feTurbulence type="turbulence" baseFrequency="0.05 0.09" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
        </filter>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <circle cx={C} cy={C} r="60" fill={color} opacity="0.26" filter={`url(#${uid}-b)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 1.6s ease-in-out infinite" }} />
      <Arc r={90} color={color} progress={progress} />
      {/* lightning bolts crackling */}
      <g fill="none" stroke="#ffd0c4" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {[0, 72, 144, 216, 288].map((a, i) => (
          <polyline key={i} className="reactor-anim" points={bolt(a)}
            style={{ animation: `reactor-arc ${0.7 + i * 0.11}s linear ${i * 0.08}s infinite` }} />
        ))}
      </g>
      {/* corona spikes */}
      <g className="reactor-anim" style={{ animation: "reactor-spin-rev 8s linear infinite" }}>
        {Array.from({ length: 12 }, (_, i) => {
          const [x1, y1] = polar(64, i * 30);
          const [x2, y2] = polar(78, i * 30);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />;
        })}
      </g>
      <Orbit r={50} n={12} dot={2} color="#ff8a6a" dur={5} />
      <g className="reactor-anim" style={{ animation: "reactor-throb 0.9s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="30" fill={`url(#${uid}-core)`} filter={`url(#${uid}-plasma)`} />
      </g>
      <circle cx={C} cy={C} r="11" fill="#fff2ec" />
    </g>
  );
}

// ── 6 · FUSION ─────────────────────────────────────────────────────────────
function Fusion({ color, progress, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-star`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#eafcff" />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor="#2a7fa0" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.6" />
          <stop offset="60%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-plasma`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" />
        </filter>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <circle cx={C} cy={C} r="96" fill={`url(#${uid}-halo)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 3s ease-in-out infinite" }} />
      <Arc r={90} color={color} progress={progress} />
      {/* corona rays */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 40s linear infinite" }}>
        {Array.from({ length: 16 }, (_, i) => {
          const a = i * 22.5;
          const [bx, by] = polar(40, a);
          const [lx, ly] = polar(50, a - 4);
          const [rx, ry] = polar(50, a + 4);
          const [tx, ty] = polar(80, a);
          return <polygon key={i} className="reactor-anim" points={`${lx},${ly} ${tx},${ty} ${rx},${ry} ${bx},${by}`}
            fill={color} opacity="0.4"
            style={{ animation: `reactor-ray ${2 + (i % 4) * 0.4}s ease-in-out ${i * 0.1}s infinite` }} />;
        })}
      </g>
      {/* lens flare cross */}
      <g stroke="#eafcff" strokeLinecap="round" opacity="0.8" filter={`url(#${uid}-b)`}>
        <line x1="14" y1="100" x2="186" y2="100" strokeWidth="1.4" />
        <line x1="100" y1="20" x2="100" y2="180" strokeWidth="1.2" />
      </g>
      <Orbit r={62} n={14} dot={1.8} color="#eafcff" dur={7} />
      <Orbit r={46} n={8} dot={1.5} color="#ffffff" dur={5} rev op={0.85} />
      {/* churning plasma star */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 26s linear infinite" }}>
        <circle cx={C} cy={C} r="30" fill={`url(#${uid}-star)`} filter={`url(#${uid}-plasma)`} />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-throb 2s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="15" fill="#ffffff" />
      </g>
    </>
  );
}

// ── 7 · SINGULARITY ─────────────────────────────────────────────────────────
function Singularity({ color, uid }: TierProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-disk`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3a2a5a" />
          <stop offset="30%" stopColor={color} />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor="#3a2a5a" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="55%" stopColor={color} stopOpacity="0" />
          <stop offset="72%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      {/* space-warp rings */}
      {[92, 80, 70].map((r, i) => (
        <circle key={i} cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth="0.8"
          className="reactor-anim" style={{ animation: `reactor-warp ${5 + i}s ease-in-out ${i * 0.6}s infinite` }} />
      ))}
      {/* gravitational glow */}
      <circle cx={C} cy={C} r="72" fill={`url(#${uid}-glow)`} filter={`url(#${uid}-b)`} />
      {/* accretion disk: back half (rendered behind horizon) */}
      <ellipse cx={C} cy={C} rx="72" ry="17" fill="none" stroke={`url(#${uid}-disk)`} strokeWidth="9"
        strokeDasharray="10 6" className="reactor-anim"
        style={{ animation: "reactor-stream 2.4s linear infinite" }} opacity="0.55" filter={`url(#${uid}-b)`} />
      {/* event horizon */}
      <circle cx={C} cy={C} r="27" fill="#050506" />
      {/* photon ring: bright bent-light edge */}
      <circle cx={C} cy={C} r="28" fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.95"
        className="reactor-anim" style={{ animation: "reactor-bloom 3s ease-in-out infinite" }} />
      <circle cx={C} cy={C} r="30.5" fill="none" stroke={color} strokeWidth="1.4" opacity="0.6" filter={`url(#${uid}-b)`} />
      {/* accretion disk: front half (over the horizon) */}
      <path d={`M 28 ${C} A 72 17 0 0 0 172 ${C}`} fill="none" stroke={`url(#${uid}-disk)`} strokeWidth="10"
        strokeLinecap="round" strokeDasharray="12 6" className="reactor-anim"
        style={{ animation: "reactor-stream 2s linear infinite" }} />
      {/* lensed top arc */}
      <path d={`M 40 ${C} A 60 40 0 0 1 160 ${C}`} fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.55" filter={`url(#${uid}-b)`} />
      {/* infalling matter spiralling in */}
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} className="reactor-anim" cx={C} cy={38} r={1.6} fill={i % 2 ? "#ffffff" : color}
          style={{ animation: `reactor-inspiral ${3 + (i % 3) * 0.8}s ease-in ${i * 0.5}s infinite` }} />
      ))}
    </>
  );
}

// ── 8 · QUASAR ──────────────────────────────────────────────────────────────
function Quasar({ color, progress, uid }: TierProps) {
  const jet = (up: boolean) => {
    const tipY = up ? 6 : 194;
    const w = 15;
    return `${C},${C} ${C - w},${tipY} ${C + w},${tipY}`;
  };
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-jet`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-disk`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="30%" stopColor={color} />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="60%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <circle cx={C} cy={C} r="94" fill={`url(#${uid}-halo)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 3s ease-in-out infinite" }} />
      <Arc r={90} color={color} progress={progress} />
      {/* space-warp rings */}
      {[84, 72].map((r, i) => (
        <circle key={i} cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth="0.7"
          className="reactor-anim" style={{ animation: `reactor-warp ${5 + i}s ease-in-out ${i * 0.5}s infinite` }} />
      ))}
      {/* bipolar relativistic jets */}
      <g filter={`url(#${uid}-b)`}>
        <polygon className="reactor-anim" points={jet(true)} fill={`url(#${uid}-jet)`}
          style={{ animation: "reactor-jet 1.6s ease-in-out infinite" }} />
        <polygon className="reactor-anim" points={jet(false)} fill={`url(#${uid}-jet)`}
          style={{ animation: "reactor-jet 1.6s ease-in-out 0.2s infinite" }} />
      </g>
      {/* jet particle streams */}
      <g stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8">
        <line x1={C} y1={C} x2={C} y2="10" strokeDasharray="3 9" className="reactor-anim"
          style={{ animation: "reactor-stream 1.4s linear infinite" }} />
        <line x1={C} y1={C} x2={C} y2="190" strokeDasharray="3 9" className="reactor-anim"
          style={{ animation: "reactor-stream 1.4s linear infinite" }} />
      </g>
      {/* edge-on accretion disk */}
      <ellipse cx={C} cy={C} rx="80" ry="13" fill="none" stroke={`url(#${uid}-disk)`} strokeWidth="7"
        strokeDasharray="9 5" className="reactor-anim"
        style={{ animation: "reactor-stream 2s linear infinite" }} opacity="0.9" />
      {/* event horizon + photon ring */}
      <circle cx={C} cy={C} r="20" fill="#050506" />
      <circle cx={C} cy={C} r="21" fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.95"
        className="reactor-anim" style={{ animation: "reactor-bloom 2.4s ease-in-out infinite" }} />
      <circle cx={C} cy={C} r="23.5" fill="none" stroke={color} strokeWidth="1.4" opacity="0.6" filter={`url(#${uid}-b)`} />
    </>
  );
}

// ── 9 · BIG BANG ──────────────────────────────────────────────────────────
function BigBang({ color, progress, uid }: TierProps) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#fff2c0" />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor="#e8863a" stopOpacity="0.15" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff2c0" stopOpacity="0.7" />
          <stop offset="55%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <circle cx={C} cy={C} r="96" fill={`url(#${uid}-halo)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 2s ease-in-out infinite" }} />
      <Arc r={90} color={color} progress={progress} />
      {/* expanding shockwaves */}
      {[0, 0.8, 1.6].map((d, i) => (
        <circle key={i} cx={C} cy={C} r="40" fill="none" stroke={color} strokeWidth="2"
          className="reactor-anim" style={{ animation: `reactor-burst 2.4s ease-out ${d}s infinite` }} />
      ))}
      {/* radial light rays bursting */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 50s linear infinite" }}>
        {Array.from({ length: 28 }, (_, i) => {
          const a = i * (360 / 28);
          const [x1, y1] = polar(20, a);
          const [x2, y2] = polar(74, a);
          return <line key={i} className="reactor-anim" x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 2 ? "#fff2c0" : color} strokeWidth={i % 2 ? 1 : 1.8} strokeLinecap="round"
            style={{ animation: `reactor-ray ${1.4 + (i % 5) * 0.3}s ease-in-out ${i * 0.05}s infinite` }} />;
        })}
      </g>
      {/* ejecta debris flung outward */}
      {[0, 1.2].map((d, k) => (
        <g key={k} className="reactor-anim" style={{ animation: `reactor-burst 2.4s ease-out ${d}s infinite` }}>
          {Array.from({ length: 10 }, (_, i) => {
            const [x, y] = polar(30, i * 36);
            return <circle key={i} cx={x} cy={y} r="1.8" fill={i % 2 ? "#ffffff" : color} />;
          })}
        </g>
      ))}
      {/* lens flare cross */}
      <g stroke="#fff6d8" strokeLinecap="round" opacity="0.85" filter={`url(#${uid}-b)`}>
        <line x1="10" y1={C} x2="190" y2={C} strokeWidth="1.6" />
        <line x1={C} y1="12" x2={C} y2="188" strokeWidth="1.3" />
      </g>
      {/* genesis core */}
      <g className="reactor-anim" style={{ animation: "reactor-throb 0.8s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="26" fill={`url(#${uid}-core)`} filter={`url(#${uid}-b)`} />
      </g>
      <circle cx={C} cy={C} r="11" fill="#ffffff" />
    </>
  );
}

// ── 10 · OMNIVERSE ────────────────────────────────────────────────────────
function Omniverse({ color, progress, uid }: TierProps) {
  const tri = (r: number, rot: number) => [0, 120, 240].map((d) => polar(r, d + rot).join(",")).join(" ");
  return (
    <g className="reactor-anim" style={{ animation: "reactor-hue 12s linear infinite" }}>
      <defs>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="60%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <circle cx={C} cy={C} r="96" fill={`url(#${uid}-halo)`}
        className="reactor-anim" style={{ animation: "reactor-bloom 3.4s ease-in-out infinite" }} />
      <Arc r={92} color={color} progress={progress} />
      {/* space-warp rings */}
      {[86, 76].map((r, i) => (
        <circle key={i} cx={C} cy={C} r={r} fill="none" stroke={color} strokeWidth="0.6"
          className="reactor-anim" style={{ animation: `reactor-warp ${6 + i}s ease-in-out ${i * 0.6}s infinite` }} />
      ))}
      {/* drifting bubble universes */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 60s linear infinite" }}>
        {Array.from({ length: 6 }, (_, i) => {
          const [x, y] = polar(58, i * 60);
          return <circle key={i} cx={x} cy={y} r="17" fill={color} opacity="0.09"
            stroke={color} strokeOpacity="0.3" strokeWidth="0.6" />;
        })}
      </g>
      {/* nested counter-rotating polygons */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 34s linear infinite" }}>
        <polygon points={hex(78)} fill="none" stroke={color} strokeWidth="0.8" opacity="0.4" />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-spin-rev 26s linear infinite" }}>
        <polygon points={hex(62)} fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.35" />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-spin 20s linear infinite" }}>
        <polygon points={tri(58, 0)} fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-spin-rev 15s linear infinite" }}>
        <polygon points={tri(50, 60)} fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
      </g>
      <Orbit r={70} n={16} dot={1.6} color={color} dur={30} />
      <Orbit r={40} n={10} dot={1.5} color="#ffffff" dur={12} rev op={0.85} />
      {/* corona rays */}
      <g className="reactor-anim" style={{ animation: "reactor-spin 44s linear infinite" }}>
        {Array.from({ length: 20 }, (_, i) => {
          const a = i * 18;
          const [x1, y1] = polar(30, a);
          const [x2, y2] = polar(44, a);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.4"
            strokeLinecap="round" opacity="0.5" className="reactor-anim"
            style={{ animation: `reactor-ray ${2 + (i % 4) * 0.4}s ease-in-out ${i * 0.08}s infinite` }} />;
        })}
      </g>
      {/* mandala core */}
      <g className="reactor-anim" style={{ animation: "reactor-spin-rev 18s linear infinite" }}>
        <polygon points={hex(22)} fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
      </g>
      <g className="reactor-anim" style={{ animation: "reactor-throb 2.2s ease-in-out infinite" }}>
        <circle cx={C} cy={C} r="20" fill={`url(#${uid}-core)`} filter={`url(#${uid}-b)`} />
      </g>
      <circle cx={C} cy={C} r="8" fill="#ffffff" />
    </g>
  );
}

const RENDERERS = [Cold, Ember, Ignition, Stable, Critical, Overdrive, Fusion, Singularity, Quasar, BigBang, Omniverse];

interface Props {
  tierIndex: number;
  color: string;
  progress: number;
  danger?: boolean;
  size?: number;
  uid?: string;
}

export function ReactorCore({ tierIndex, color, progress, danger = false, size = 220, uid }: Props) {
  const t = Math.max(0, Math.min(RENDERERS.length - 1, tierIndex));
  const id = uid ?? `rc${t}`;
  const Render = RENDERERS[t];

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      className={danger ? "reactor-flick" : undefined}
      aria-label={`Reactor core, tier ${tierIndex}`}
      style={{
        maxWidth: "100%",
        ...(danger ? { animation: "reactor-flicker 1.3s steps(2, jump-none) infinite" } : {}),
      }}
    >
      {Render({ color, progress, uid: id })}

      {/* Breach overlay: destabilised containment */}
      {danger && (
        <g className="reactor-anim" style={{ animation: "reactor-spin 5s linear infinite" }}>
          <circle cx={C} cy={C} r="70" fill="none" stroke={DANGER} strokeWidth="2" strokeDasharray="4 10" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}
