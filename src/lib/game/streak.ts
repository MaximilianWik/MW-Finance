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
const LOOKBACK_DAYS = 120;

/**
 * Reactor uptime. A "clean day" is a calendar day whose counted spend is at or
 * below the daily pace (zero-spend days count clean). The current streak is the
 * run of clean days ending today; it breaks the moment a day goes over pace.
 */
export async function getStreak(): Promise<StreakInfo> {
  const { pace } = await getDailyPace();
  const today = todayIso();
  const from = shiftIso(today, -LOOKBACK_DAYS);
  const spend = await getDailySpendMap(from, today);

  // Walk backwards from today. Small epsilon absorbs float rounding.
  const eps = 0.5;
  let current = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const day = shiftIso(today, -i);
    const s = spend.get(day) ?? 0;
    if (s <= pace + eps) current++;
    else break;
  }

  const todaySpend = spend.get(today) ?? 0;
  const breachToday = todaySpend > pace + eps;

  const [gs] = await db
    .select({ best: gameState.bestStreak })
    .from(gameState)
    .limit(1);
  const storedBest = gs?.best ?? 0;

  return {
    current,
    best: Math.max(storedBest, current),
    pace,
    todaySpend,
    breachToday,
  };
}

/**
 * Streak length as-of a specific date (non-today reference). Used by shield
 * absorption so eval can compute "yesterday's streak + 1 (shielded today)".
 */
export async function getStreakAsOf(refDate: string): Promise<number> {
  const { pace } = await getDailyPace();
  const from = shiftIso(refDate, -LOOKBACK_DAYS);
  const spend = await getDailySpendMap(from, refDate);
  const eps = 0.5;
  let count = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const day = shiftIso(refDate, -i);
    const s = spend.get(day) ?? 0;
    if (s <= pace + eps) count++;
    else break;
  }
  return count;
}
