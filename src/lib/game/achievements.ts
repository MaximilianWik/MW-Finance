import { db } from "@/db";
import { achievements } from "@/db/schema";

export interface AchievementContext {
  savingsTotal: number;
  investmentsTotal: number;
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
  color: string;
  predicate: (c: AchievementContext) => boolean;
}

// 31 reactor events, ordered roughly by ease of unlocking.
export const ACHIEVEMENTS: AchievementDef[] = [
  // Savings milestones
  { id: "first_spark",   name: "First Spark",        xp: 100,  color: "#b0603a",
    description: "Put your first krona into savings.",
    predicate: (c) => c.savingsTotal > 0 },

  { id: "saver_5k",      name: "Five Thousand",       xp: 150,  color: "#3ec8b0",
    description: "5 000 kr saved all-time.",
    predicate: (c) => c.savingsTotal >= 5000 },

  { id: "saver_10k",     name: "Ten Kilo",            xp: 300,  color: "#3ec8b0",
    description: "10 000 kr saved all-time.",
    predicate: (c) => c.savingsTotal >= 10000 },

  { id: "saver_50k",     name: "Half Ton",            xp: 800,  color: "#3ec8b0",
    description: "50 000 kr saved all-time.",
    predicate: (c) => c.savingsTotal >= 50000 },

  { id: "saver_100k",    name: "Six Figures",         xp: 1500, color: "#3ec8b0",
    description: "100 000 kr saved all-time.",
    predicate: (c) => c.savingsTotal >= 100000 },

  { id: "saver_200k",    name: "Double Century",      xp: 2500, color: "#3ec8b0",
    description: "200 000 kr saved all-time.",
    predicate: (c) => c.savingsTotal >= 200000 },

  // Investment milestones
  { id: "first_investment", name: "Capital Deployed", xp: 150,  color: "#5cc8e8",
    description: "Made your first investment transfer.",
    predicate: (c) => c.investmentsTotal > 0 },

  { id: "invest_10k",    name: "Seed Round",          xp: 300,  color: "#5cc8e8",
    description: "10 000 kr invested all-time.",
    predicate: (c) => c.investmentsTotal >= 10000 },

  { id: "invest_50k",    name: "Series A",            xp: 700,  color: "#5cc8e8",
    description: "50 000 kr invested all-time.",
    predicate: (c) => c.investmentsTotal >= 50000 },

  { id: "invest_100k",   name: "Six-Figure Portfolio",xp: 1500, color: "#5cc8e8",
    description: "100 000 kr invested all-time.",
    predicate: (c) => c.investmentsTotal >= 100000 },

  { id: "invest_250k",   name: "Institutional",       xp: 3000, color: "#5cc8e8",
    description: "250 000 kr invested all-time.",
    predicate: (c) => c.investmentsTotal >= 250000 },

  // Combined wealth milestones
  { id: "total_50k",     name: "Net Worth Rising",    xp: 400,  color: "#4ec96a",
    description: "Savings + investments exceed 50 000 kr.",
    predicate: (c) => c.savingsTotal + c.investmentsTotal >= 50000 },

  { id: "total_200k",    name: "Solid Foundation",    xp: 1200, color: "#4ec96a",
    description: "Savings + investments exceed 200 000 kr.",
    predicate: (c) => c.savingsTotal + c.investmentsTotal >= 200000 },

  { id: "total_500k",    name: "Half Million",        xp: 3500, color: "#4ec96a",
    description: "Savings + investments exceed 500 000 kr.",
    predicate: (c) => c.savingsTotal + c.investmentsTotal >= 500000 },

  // Streak (uptime) milestones
  { id: "uptime_3",      name: "Online",              xp:  75,  color: "#4ec96a",
    description: "3-day containment streak.",
    predicate: (c) => c.bestStreak >= 3 },

  { id: "uptime_7",      name: "Week of Silence",     xp: 250,  color: "#4ec96a",
    description: "7-day containment streak.",
    predicate: (c) => c.bestStreak >= 7 },

  { id: "uptime_14",     name: "Fortnight Hold",      xp: 400,  color: "#4ec96a",
    description: "14-day containment streak.",
    predicate: (c) => c.bestStreak >= 14 },

  { id: "uptime_30",     name: "Lunar Containment",   xp: 750,  color: "#4ec96a",
    description: "30-day containment streak.",
    predicate: (c) => c.bestStreak >= 30 },

  { id: "uptime_60",     name: "Sixty Suns",          xp: 1200, color: "#4ec96a",
    description: "60-day containment streak.",
    predicate: (c) => c.bestStreak >= 60 },

  { id: "uptime_100",    name: "Century Core",        xp: 2000, color: "#c080e0",
    description: "100-day containment streak.",
    predicate: (c) => c.bestStreak >= 100 },

  { id: "uptime_200",    name: "Iron Discipline",     xp: 4000, color: "#c080e0",
    description: "200-day containment streak.",
    predicate: (c) => c.bestStreak >= 200 },

  // Stored charge
  { id: "capacitor",     name: "Charged Capacitor",   xp: 200,  color: "#5cc8e8",
    description: "Bank 2 000 kr of stored charge in a week.",
    predicate: (c) => c.potCharge >= 2000 },

  { id: "capacitor_5k",  name: "Full Charge",         xp: 500,  color: "#5cc8e8",
    description: "Bank 5 000 kr of stored charge in a week.",
    predicate: (c) => c.potCharge >= 5000 },

  // Challenges
  { id: "first_challenge", name: "Directive Complete",xp: 150,  color: "#e8c545",
    description: "Complete your first weekly challenge.",
    predicate: (c) => c.challengesCompleted >= 1 },

  { id: "challenge_5",   name: "Five Directives",     xp: 500,  color: "#e8c545",
    description: "Complete 5 weekly challenges.",
    predicate: (c) => c.challengesCompleted >= 5 },

  { id: "challenge_10",  name: "Ten-Count",           xp: 900,  color: "#e8c545",
    description: "Complete 10 weekly challenges.",
    predicate: (c) => c.challengesCompleted >= 10 },

  { id: "challenge_25",  name: "Veteran Operator",    xp: 2000, color: "#e8c545",
    description: "Complete 25 weekly challenges.",
    predicate: (c) => c.challengesCompleted >= 25 },

  // Tier reach
  { id: "ignition",      name: "Ignition",            xp: 300,  color: "#e8863a",
    description: "Reach the IGNITION output tier.",
    predicate: (c) => c.tierIndex >= 2 },

  { id: "overdrive",     name: "Redline",             xp: 1000, color: "#e85252",
    description: "Reach the OVERDRIVE output tier.",
    predicate: (c) => c.tierIndex >= 5 },

  { id: "fusion",        name: "Self-Sustaining",     xp: 2000, color: "#5cc8e8",
    description: "Reach the FUSION output tier.",
    predicate: (c) => c.tierIndex >= 6 },

  { id: "singularity",   name: "Event Horizon",       xp: 4000, color: "#c080e0",
    description: "Reach SINGULARITY. The curve bends.",
    predicate: (c) => c.tierIndex >= 7 },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export interface UnlockedAchievement extends AchievementDef {
  unlockedAt: Date;
}

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

export async function getAchievementXp(): Promise<number> {
  const rows = await db.select({ id: achievements.id }).from(achievements);
  return rows.reduce((sum, r) => sum + (BY_ID.get(r.id)?.xp ?? 0), 0);
}

export async function evaluateAchievements(ctx: AchievementContext): Promise<AchievementDef[]> {
  const existing = await db.select({ id: achievements.id }).from(achievements);
  const have = new Set(existing.map((r) => r.id));
  const toUnlock = ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.predicate(ctx));
  if (toUnlock.length === 0) return [];
  await db.insert(achievements).values(toUnlock.map((a) => ({ id: a.id }))).onConflictDoNothing();
  return toUnlock;
}
