import { getDailyPace, getDailySpendMap, todayIso, shiftIso, daysBetween, weekStartOf } from "./pace";

export interface PotInfo {
  charge: number;      // stored charge this week (kr under pace, floored at 0)
  capacity: number;    // theoretical weekly max (pace × days elapsed)
  fill: number;        // 0..1 charge / capacity, for the capacitor bar
  pace: number;
  todayDelta: number;  // pace − today's spend (negative = discharging)
  discharging: boolean;
  weekStart: string;
}

/**
 * Stored charge = the capacitor. Each day under pace banks charge; a day over
 * pace discharges it (visible loss). Measured week-to-date (Mon→today).
 */
export async function getPot(): Promise<PotInfo> {
  const { pace } = await getDailyPace();
  const today = todayIso();
  const weekStart = weekStartOf(today);
  const spend = await getDailySpendMap(weekStart, today);

  const daysElapsed = daysBetween(weekStart, today);
  let charge = 0;
  for (let i = 0; i < daysElapsed; i++) {
    const day = shiftIso(weekStart, i);
    const s = spend.get(day) ?? 0;
    charge += pace - s; // under pace banks, over pace drains
  }
  charge = Math.max(0, charge);

  const todaySpend = spend.get(today) ?? 0;
  const todayDelta = pace - todaySpend;
  const capacity = pace * daysElapsed;

  return {
    charge,
    capacity,
    fill: capacity > 0 ? Math.min(1, charge / capacity) : 0,
    pace,
    todayDelta,
    discharging: todayDelta < 0,
    weekStart,
  };
}
