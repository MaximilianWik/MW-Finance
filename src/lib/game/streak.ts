import { db } from "@/db";
import { gameState } from "@/db/schema";
import { getDailyPace, getDailySpendMap, todayIso, shiftIso } from "./pace";

export interface StreakInfo {
  current: number;      // consecutive clean days ending today
  best: number;         // all-time high-water mark (max of stored + current)
  pace: number;         // allowed spend per clean day
  todaySpend: number;
  breachToday: boolean; // today already over pace → containment breach
}

// How far back to scan for the streak walk.
export const LOOKBACK_DAYS = 120;
const EPS = 0.5; // absorbs float rounding

/** Run of clean days ending at `refDate`. A shielded day counts as clean. */
function walk(spend: Map<string, number>, pace: number, refDate: string, shielded: Set<string>): number {
  let count = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const day = shiftIso(refDate, -i);
    if ((spend.get(day) ?? 0) <= pace + EPS || shielded.has(day)) count++;
    else break;
  }
  return count;
}

async function loadShieldState(): Promise<{ best: number; shieldedDays: string[] }> {
  const [gs] = await db
    .select({ best: gameState.bestStreak, shieldedDays: gameState.shieldedDays })
    .from(gameState)
    .limit(1);
  return { best: gs?.best ?? 0, shieldedDays: gs?.shieldedDays ?? [] };
}

/**
 * Reactor uptime. A "clean day" is a calendar day whose counted spend is at or
 * below the daily pace (zero-spend days count clean), or a day a shield
 * absorbed. The current streak is the run of clean days ending today.
 * Pass `shieldedDays` to use a set the caller has just updated (eval).
 */
export async function getStreak(opts: { shieldedDays?: string[] } = {}): Promise<StreakInfo> {
  const { pace } = await getDailyPace();
  const today = todayIso();
  const spend = await getDailySpendMap(shiftIso(today, -LOOKBACK_DAYS), today);
  const stored = await loadShieldState();
  const shielded = new Set(opts.shieldedDays ?? stored.shieldedDays);

  const current = walk(spend, pace, today, shielded);
  const todaySpend = spend.get(today) ?? 0;

  return {
    current,
    best: Math.max(stored.best, current),
    pace,
    todaySpend,
    breachToday: todaySpend > pace + EPS && !shielded.has(today),
  };
}

/**
 * Spend shields on breach days, walking back from today. Bank booking dates
 * lag 1-3 days, so a breach often appears after its day has passed: every
 * unshielded breach on/after `since` gets a shield while shields last. Stops
 * at the first breach it cannot absorb (or one older than `since`, which broke
 * the streak before the last eval and stays broken). Idempotent: absorbed days
 * are returned for the caller to store, and are clean on the next run.
 */
export async function absorbBreaches(
  shields: number,
  shieldedDays: string[],
  since: string
): Promise<{ shields: number; shieldedDays: string[]; absorbed: { day: string; spend: number }[]; pace: number }> {
  const { pace } = await getDailyPace();
  const today = todayIso();
  const spend = await getDailySpendMap(shiftIso(today, -LOOKBACK_DAYS), today);
  const shielded = new Set(shieldedDays);
  const absorbed: { day: string; spend: number }[] = [];

  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const day = shiftIso(today, -i);
    const s = spend.get(day) ?? 0;
    if (s <= pace + EPS || shielded.has(day)) continue;
    if (day < since || shields <= 0) break;
    shields--;
    shielded.add(day);
    absorbed.push({ day, spend: s });
  }

  // Keep only days the streak walk can still reach.
  const oldest = shiftIso(today, -LOOKBACK_DAYS);
  return { shields, shieldedDays: [...shielded].filter((d) => d >= oldest).sort(), absorbed, pace };
}
