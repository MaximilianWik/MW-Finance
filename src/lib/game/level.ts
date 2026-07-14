// Reactor output tiers. XP is DERIVED from savings, streak and unlocks, never
// stored, so it can never drift out of sync with the underlying data.

export interface Tier {
  name: string;
  minXp: number;
  color: string;   // core hue at this tier
  blurb: string;
}

// 8 tiers, cold → runaway. Thresholds are cumulative XP.
export const TIERS: Tier[] = [
  { name: "COLD",        minXp: 0,     color: "#5a6b7a", blurb: "Reactor offline. Cold iron." },
  { name: "EMBER",       minXp: 500,   color: "#b0603a", blurb: "First heat. Containment holding." },
  { name: "IGNITION",    minXp: 1500,  color: "#e8863a", blurb: "Sustained burn achieved." },
  { name: "STABLE",      minXp: 3500,  color: "#4ec96a", blurb: "Green band. Nominal output." },
  { name: "CRITICAL",    minXp: 7000,  color: "#e8c545", blurb: "High yield. Watch the gauges." },
  { name: "OVERDRIVE",   minXp: 12000, color: "#e85252", blurb: "Past redline and holding." },
  { name: "FUSION",      minXp: 20000, color: "#5cc8e8", blurb: "Self-sustaining fusion." },
  { name: "SINGULARITY", minXp: 35000, color: "#c080e0", blurb: "Bends the curve. Unbounded." },
];

export interface XpInputs {
  savingsTotal: number;
  investmentsTotal: number; // all-time kr sent to investments
  bestStreak: number;
  achievementXp: number;
  challengeXp: number;
}

// XP weighting: savings + investments are the backbone; streak multiplies over time.
export const XP_PER_100_KR        = 5;  // 5 XP per 100 kr saved
export const XP_PER_100_KR_INVEST = 8;  // 8 XP per 100 kr invested (deployed capital earns more)
export const XP_PER_STREAK_DAY    = 50;

export function computeXp(i: XpInputs): number {
  return (
    Math.floor(i.savingsTotal  / 100) * XP_PER_100_KR +
    Math.floor(i.investmentsTotal / 100) * XP_PER_100_KR_INVEST +
    i.bestStreak * XP_PER_STREAK_DAY +
    i.achievementXp +
    i.challengeXp
  );
}

export interface LevelInfo {
  xp: number;
  tier: Tier;
  index: number;          // 0..7
  next: Tier | null;      // null at max tier
  xpIntoTier: number;
  xpForNext: number | null;
  progress: number;       // 0..1 toward next tier (1 at max)
  danger: boolean;        // containment breach → destabilized core
}

export function levelFromXp(xp: number, danger = false): LevelInfo {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (xp >= TIERS[i].minXp) index = i;
  }
  const tier = TIERS[index];
  const next = index < TIERS.length - 1 ? TIERS[index + 1] : null;
  const xpIntoTier = xp - tier.minXp;
  const xpForNext = next ? next.minXp - tier.minXp : null;
  const progress = next && xpForNext ? Math.min(1, xpIntoTier / xpForNext) : 1;
  return { xp, tier, index, next, xpIntoTier, xpForNext, progress, danger };
}
