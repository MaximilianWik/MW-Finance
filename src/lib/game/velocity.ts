import { ACHIEVEMENTS, type AchievementContext } from "./achievements";
import { TIERS } from "./level";

// ─── Next milestone ─────────────────────────────────────────────────────────

interface MilestoneSpec {
  id: string;
  getValue: (ctx: AchievementContext & { xp: number }) => number;
  target: number;
  unit: "kr" | "d" | "challenges" | "XP" | "weeks";
}

// Each entry maps an achievement id to a single numeric progress value.
const SPECS: MilestoneSpec[] = [
  { id: "first_investment", target: 1,        unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_10k",       target: 10000,    unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_25k",       target: 25000,    unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_50k",       target: 50000,    unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_100k",      target: 100000,   unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_250k",      target: 250000,   unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_500k",      target: 500000,   unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_1m",        target: 1000000,  unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "uptime_3",         target: 3,        unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_7",         target: 7,        unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_14",        target: 14,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_30",        target: 30,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_60",        target: 60,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_100",       target: 100,      unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_200",       target: 200,      unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_365",       target: 365,      unit: "d",          getValue: c => c.bestStreak },
  { id: "capacitor",        target: 2000,     unit: "kr",         getValue: c => c.potCharge },
  { id: "capacitor_5k",     target: 5000,     unit: "kr",         getValue: c => c.potCharge },
  { id: "capacitor_10k",    target: 10000,    unit: "kr",         getValue: c => c.potCharge },
  { id: "first_challenge",  target: 1,        unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_5",      target: 5,        unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_10",     target: 10,       unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_25",     target: 25,       unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_50",     target: 50,       unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "directive_3",      target: 3,        unit: "weeks",      getValue: c => c.directiveStreak },
  { id: "directive_5",      target: 5,        unit: "weeks",      getValue: c => c.directiveStreak },
  { id: "directive_10",     target: 10,       unit: "weeks",      getValue: c => c.directiveStreak },
  { id: "budget_first",     target: 1,        unit: "XP",         getValue: c => c.budgetXp },
  { id: "budget_5k",        target: 150,      unit: "XP",         getValue: c => c.budgetXp },
  { id: "budget_20k",       target: 600,      unit: "XP",         getValue: c => c.budgetXp },
  { id: "ignition",         target: TIERS[2].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "overdrive",        target: TIERS[5].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "fusion",           target: TIERS[6].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "singularity",      target: TIERS[7].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "quasar",           target: TIERS[8].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "big_bang",         target: TIERS[9].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "omniverse",        target: TIERS[10].minXp, unit: "XP", getValue: c => c.xp },
  { id: "oblivion",         target: TIERS[11].minXp, unit: "XP", getValue: c => c.xp },
];

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface MilestoneInfo {
  achievementId: string;
  name: string;
  color: string;
  xp: number;
  current: number;
  target: number;
  unit: string;
  needed: number;
  pct: number; // 0..1 complete
}

/**
 * Closest not-yet-unlocked achievement by % remaining. Returns null when
 * everything is unlocked or context is unavailable.
 */
export function getNextMilestone(
  unlockedIds: Set<string>,
  ctx: AchievementContext & { xp: number }
): MilestoneInfo | null {
  let best: MilestoneInfo | null = null;
  let bestPct = -1;

  for (const spec of SPECS) {
    if (unlockedIds.has(spec.id)) continue;
    const ach = ACH_BY_ID.get(spec.id);
    if (!ach) continue;
    const current = spec.getValue(ctx);
    if (current >= spec.target) continue; // predicate-wise should already be unlocked, skip
    const pct = spec.target > 0 ? current / spec.target : 0;
    if (pct > bestPct) {
      bestPct = pct;
      best = {
        achievementId: spec.id,
        name:    ach.name,
        color:   ach.color,
        xp:      ach.xp,
        current: Math.floor(current),
        target:  spec.target,
        unit:    spec.unit,
        needed:  Math.ceil(spec.target - current),
        pct,
      };
    }
  }

  return best;
}
