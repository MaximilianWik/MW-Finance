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
  investmentsTotal: number;
  bestStreak: number;
  achievementXp: number;
  challengeXp: number;
}

// ── XP weights ───────────────────────────────────────────────────────────────
export const XP_PER_100_KR        = 5;  // 5 XP per 100 kr saved
export const XP_PER_100_KR_INVEST = 8;  // 8 XP per 100 kr invested

// Streak XP scales with streak length. Each completed 7-day block adds
// XP_STREAK_BONUS extra XP per day, rewarding sustained containment.
//
//   daily rate(d) = XP_STREAK_BASE + floor(d / 7) × XP_STREAK_BONUS
//   streak XP     = d × daily rate(d)
//
// Examples (d = days):
//   1 d  →   40 XP/d   =       40 XP
//   7 d  →   52 XP/d   =      364 XP
//  30 d  →   88 XP/d   =    2 640 XP
//  60 d  →  136 XP/d   =    8 160 XP
// 100 d  →  208 XP/d   =   20 800 XP   (FUSION territory from streak alone)
// 365 d  →  664 XP/d   =  242 360 XP
export const XP_STREAK_BASE  = 40;  // base XP per streak day
export const XP_STREAK_BONUS = 12;  // additional XP/day earned per completed 7-day block

/** XP per day at a given streak length (always >= XP_STREAK_BASE). */
export function streakDailyRate(days: number): number {
  return XP_STREAK_BASE + Math.floor(days / 7) * XP_STREAK_BONUS;
}

/** Total streak XP for a given best streak. */
export function computeStreakXp(days: number): number {
  return days * streakDailyRate(days);
}

export function computeXp(i: XpInputs): number {
  return (
    Math.floor(i.savingsTotal     / 100) * XP_PER_100_KR +
    Math.floor(i.investmentsTotal / 100) * XP_PER_100_KR_INVEST +
    computeStreakXp(i.bestStreak) +
    i.achievementXp +
    i.challengeXp
  );
}

export interface LevelInfo {
  xp: number;
  tier: Tier;
  index: number;
  next: Tier | null;
  xpIntoTier: number;
  xpForNext: number | null;
  progress: number;  // 0..1 toward next tier
  danger: boolean;
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
