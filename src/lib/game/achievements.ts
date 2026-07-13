import { db } from "@/db";
import { achievements } from "@/db/schema";

/** Everything an achievement predicate can look at. */
export interface AchievementContext {
  savingsTotal: number;
  bestStreak: number;
  currentStreak: number;
  tierIndex: number;
  challengesCompleted: number;
  potCharge: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  xp: number;
  color: string;                 // unique glow per badge
  predicate: (c: AchievementContext) => boolean;
}

// Logged reactor events. Ordered roughly by escalating drama.
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_spark", name: "First Spark", description: "Put your first krona into savings.", xp: 100, color: "#b0603a",
    predicate: (c) => c.savingsTotal > 0 },
  { id: "uptime_7", name: "Week of Silence", description: "7-day containment streak.", xp: 250, color: "#4ec96a",
    predicate: (c) => c.bestStreak >= 7 },
  { id: "capacitor", name: "Charged Capacitor", description: "Bank 2 000 kr of stored charge in a week.", xp: 200, color: "#5cc8e8",
    predicate: (c) => c.potCharge >= 2000 },
  { id: "first_challenge", name: "Directive Complete", description: "Complete your first weekly challenge.", xp: 150, color: "#e8c545",
    predicate: (c) => c.challengesCompleted >= 1 },
  { id: "ignition", name: "Ignition", description: "Reach the IGNITION output tier.", xp: 300, color: "#e8863a",
    predicate: (c) => c.tierIndex >= 2 },
  { id: "saver_10k", name: "Ten Kilo", description: "10 000 kr saved all-time.", xp: 300, color: "#3ec8b0",
    predicate: (c) => c.savingsTotal >= 10000 },
  { id: "uptime_14", name: "Fortnight Hold", description: "14-day containment streak.", xp: 400, color: "#4ec96a",
    predicate: (c) => c.bestStreak >= 14 },
  { id: "challenge_5", name: "Five Directives", description: "Complete 5 weekly challenges.", xp: 500, color: "#e8c545",
    predicate: (c) => c.challengesCompleted >= 5 },
  { id: "uptime_30", name: "Lunar Containment", description: "30-day containment streak.", xp: 750, color: "#5cc8e8",
    predicate: (c) => c.bestStreak >= 30 },
  { id: "saver_50k", name: "Half Ton", description: "50 000 kr saved all-time.", xp: 800, color: "#3ec8b0",
    predicate: (c) => c.savingsTotal >= 50000 },
  { id: "overdrive", name: "Redline", description: "Reach the OVERDRIVE output tier.", xp: 1000, color: "#e85252",
    predicate: (c) => c.tierIndex >= 5 },
  { id: "saver_100k", name: "Six Figures", description: "100 000 kr saved all-time.", xp: 1500, color: "#c080e0",
    predicate: (c) => c.savingsTotal >= 100000 },
  { id: "uptime_100", name: "Century Core", description: "100-day containment streak.", xp: 2000, color: "#c080e0",
    predicate: (c) => c.bestStreak >= 100 },
  { id: "fusion", name: "Self-Sustaining", description: "Reach the FUSION output tier.", xp: 2000, color: "#5cc8e8",
    predicate: (c) => c.tierIndex >= 6 },
  { id: "singularity", name: "Event Horizon", description: "Reach SINGULARITY. The curve bends.", xp: 4000, color: "#c080e0",
    predicate: (c) => c.tierIndex >= 7 },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface UnlockedAchievement extends AchievementDef {
  unlockedAt: Date;
}

/** Persisted unlocks joined to their definitions, newest first. */
export async function getUnlocked(): Promise<UnlockedAchievement[]> {
  const rows = await db.select().from(achievements);
  return rows
    .map((r) => {
      const def = BY_ID.get(r.id);
      return def ? { ...def, unlockedAt: r.unlockedAt } : null;
    })
    .filter((x): x is UnlockedAchievement => x !== null)
    .sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime());
}

/** Total XP from unlocked achievements. */
export async function getAchievementXp(): Promise<number> {
  const rows = await db.select({ id: achievements.id }).from(achievements);
  return rows.reduce((sum, r) => sum + (BY_ID.get(r.id)?.xp ?? 0), 0);
}

/**
 * Unlock any newly-satisfied achievements. Returns the defs unlocked this run
 * (for notifications). Idempotent; already-unlocked ids are skipped.
 */
export async function evaluateAchievements(ctx: AchievementContext): Promise<AchievementDef[]> {
  const existing = await db.select({ id: achievements.id }).from(achievements);
  const have = new Set(existing.map((r) => r.id));

  const toUnlock = ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.predicate(ctx));
  if (toUnlock.length === 0) return [];

  await db
    .insert(achievements)
    .values(toUnlock.map((a) => ({ id: a.id })))
    .onConflictDoNothing();

  return toUnlock;
}
