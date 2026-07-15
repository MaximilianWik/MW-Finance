import { getDailyPace, getDailySpendMap, todayIso, shiftIso } from "./pace";

export interface DayRecord {
  date: string;      // YYYY-MM-DD
  spend: number;
  pace: number;
  clean: boolean;    // spend <= pace (including zero-spend days)
  breach: boolean;   // spend > pace
  noSpend: boolean;  // zero spend (clean subset, shown differently)
}

/**
 * Last `days` calendar days (aligned to a Monday so the week-grid is clean),
 * each labelled clean/breach/no-spend relative to the daily pace. Used by
 * the fuel-rod containment log on /rank.
 */
export async function getDayHistory(days = 84): Promise<DayRecord[]> {
  const { pace } = await getDailyPace();
  const today = todayIso();

  // Align start to the Monday of the week 12 weeks ago so the grid fills neatly.
  const rawStart = shiftIso(today, -(days - 1));
  // Find Monday of rawStart's week.
  const d = new Date(rawStart + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const backToMon = dow === 0 ? 6 : dow - 1;
  const start = shiftIso(rawStart, -backToMon);
  // Extend `days` to cover from start to today.
  const totalDays = Math.ceil(
    (new Date(today + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime()) /
      86400_000
  ) + 1;

  const spendMap = await getDailySpendMap(start, today);
  const eps = 0.5;
  const records: DayRecord[] = [];

  for (let i = 0; i < totalDays; i++) {
    const date = shiftIso(start, i);
    const isFuture = date > today;
    const spend = isFuture ? 0 : (spendMap.get(date) ?? 0);
    records.push({
      date,
      spend,
      pace,
      clean:   isFuture || spend <= pace + eps,
      breach:  !isFuture && spend > pace + eps,
      noSpend: !isFuture && spend <= eps,
    });
  }

  return records;
}
