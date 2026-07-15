// Reactor output tiers. XP is DERIVED from savings, streak and unlocks, never
// stored, so it can never drift out of sync with the underlying data.

export interface Tier {
  name: string;
  minXp: number;
  color: string;
  blurb: string;
}

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
  budgetXp: number;       // accumulated XP from finishing salary cycles under budget
}

// ── XP weights ───────────────────────────────────────────────────────────────
export const XP_PER_100_KR        = 5;   // per 100 kr saved
export const XP_PER_100_KR_INVEST = 8;   // per 100 kr invested (more: deployed capital)

// Streak XP: the per-day rate grows by +5 for every day you maintain containment.
//
//   daily rate(d) = XP_STREAK_BASE + d × XP_STREAK_STEP
//   total XP      = d × (40 + d × 5)  =  40d + 5d²
//
//    7 d:    75/d =      525 XP
//   14 d:   110/d =    1 540 XP
//   30 d:   190/d =    5 700 XP
//   60 d:   340/d =   20 400 XP
//  100 d:   540/d =   54 000 XP
//  365 d: 1 865/d =  680 725 XP
export const XP_STREAK_BASE = 40;
export const XP_STREAK_STEP = 5;

// Budget discipline XP: at end of each salary cycle where total spend <
// total budget, you earn XP_BUDGET_PER_100_KR per 100 kr saved.
export const XP_BUDGET_PER_100_KR = 3;

/** XP per day at streak length d. */
export function streakDailyRate(d: number): number {
  return XP_STREAK_BASE + d * XP_STREAK_STEP;
}

/** Total streak XP for a best-streak of d days. */
export function computeStreakXp(d: number): number {
  return d * streakDailyRate(d);
}

export function computeXp(i: XpInputs): number {
  return (
    Math.floor(i.savingsTotal     / 100) * XP_PER_100_KR +
    Math.floor(i.investmentsTotal / 100) * XP_PER_100_KR_INVEST +
    computeStreakXp(i.bestStreak) +
    i.achievementXp +
    i.challengeXp +
    i.budgetXp
  );
}

export interface LevelInfo {
  xp: number;
  tier: Tier;
  index: number;
  next: Tier | null;
  xpIntoTier: number;
  xpForNext: number | null;
  progress: number;
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
