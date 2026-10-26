/**
 * Robust per-category spending baseline for budget recalibration.
 *
 * A: the baseline is the MEDIAN of the last finished salary cycles, so one
 *    heavy cycle barely moves it (the old mean over 3 cycles did, and it also
 *    counted the unfinished current cycle as a full one).
 * B: single purchases far above the category's normal size are "one-offs":
 *    left out of the baseline and reported separately.
 *
 * Pure functions only: no DB, so they are easy to test.
 */

export const ONE_OFF_MIN_KR = 1_000;
export const ONE_OFF_FACTOR = 3;

export interface SpendTx {
  id: number;
  categoryId: number;
  amount: number; // positive kr
  bookingDate: string; // YYYY-MM-DD
  merchant: string | null;
}

export interface CycleRange {
  from: string;
  to: string; // finished cycles only
}

export interface OneOff extends SpendTx {
  typical: number; // the category's median purchase size
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Purchases ≥ ONE_OFF_MIN_KR and ≥ ONE_OFF_FACTOR × the category's median purchase. */
export function findOneOffs(txs: SpendTx[], skipCategoryIds: Set<number> = new Set()): OneOff[] {
  const byCat = new Map<number, number[]>();
  for (const t of txs) {
    const arr = byCat.get(t.categoryId) ?? [];
    arr.push(t.amount);
    byCat.set(t.categoryId, arr);
  }
  const typical = new Map([...byCat].map(([id, amounts]) => [id, median(amounts)]));

  return txs
    .filter((t) => !skipCategoryIds.has(t.categoryId))
    .map((t) => ({ ...t, typical: typical.get(t.categoryId) ?? 0 }))
    .filter((t) => t.amount >= ONE_OFF_MIN_KR && t.amount >= ONE_OFF_FACTOR * t.typical);
}

/**
 * Spend per category per finished cycle (one-offs excluded), and its median.
 * Cycles with no spend count as 0, so a category you rarely use stays low.
 */
export function cycleBaselines(
  txs: SpendTx[],
  cycles: CycleRange[],
  oneOffIds: Set<number>
): Map<number, { perCycle: number[]; median: number }> {
  const sums = new Map<number, number[]>();
  for (const t of txs) {
    if (oneOffIds.has(t.id)) continue;
    const i = cycles.findIndex((c) => t.bookingDate >= c.from && t.bookingDate <= c.to);
    if (i < 0) continue;
    const arr = sums.get(t.categoryId) ?? new Array<number>(cycles.length).fill(0);
    arr[i] += t.amount;
    sums.set(t.categoryId, arr);
  }
  const out = new Map<number, { perCycle: number[]; median: number }>();
  for (const [id, perCycle] of sums) {
    out.set(id, { perCycle: perCycle.map((v) => Math.round(v)), median: Math.round(median(perCycle)) });
  }
  return out;
}

/**
 * C: move a budget at most ±maxPct from its current value per recalibration,
 * rounded to the nearest 50 kr. No current budget → the proposal stands.
 */
export function clampChange(
  current: number | null,
  proposed: number,
  maxPct = 0.2
): { value: number; clamped: boolean } {
  const round50 = (v: number) => Math.max(0, Math.round(v / 50) * 50);
  if (current == null || current <= 0) return { value: round50(proposed), clamped: false };
  const lo = current * (1 - maxPct);
  const hi = current * (1 + maxPct);
  const bounded = Math.min(hi, Math.max(lo, proposed));
  // Rounding to 50 must not push it back outside the band.
  let value = round50(bounded);
  if (value > hi) value -= 50;
  if (value < lo) value += 50;
  return { value, clamped: bounded !== proposed };
}
