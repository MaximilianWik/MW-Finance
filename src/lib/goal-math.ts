/**
 * Pure goal maths: pace, ETA, required contribution, projection, milestones.
 * No DB, no React: shared by the server (goal pages) and the client simulator.
 *
 * Time unit = one month (≈ one salary cycle). `annualReturnPct` compounds
 * monthly; 0 means deposits only (the balances we track don't include market
 * growth, so 0 is the honest default).
 */

/** Hard stop so a tiny pace can't loop forever: 100 years. */
export const MAX_MONTHS = 1200;

export function monthlyRate(annualReturnPct: number): number {
  return annualReturnPct > 0 ? Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1 : 0;
}

/** Months until `balance` reaches `target` saving `monthly` per month. null = never. */
export function monthsToTarget(
  balance: number,
  target: number,
  monthly: number,
  annualReturnPct = 0
): number | null {
  if (balance >= target) return 0;
  const r = monthlyRate(annualReturnPct);
  if (r === 0) return monthly > 0 ? Math.ceil((target - balance) / monthly) : null;
  let b = balance;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    b = b * (1 + r) + monthly;
    if (b >= target) return m;
  }
  return null;
}

/** Monthly amount needed to reach `target` in `months`. 0 when already there. */
export function requiredMonthly(
  balance: number,
  target: number,
  months: number,
  annualReturnPct = 0
): number {
  if (balance >= target) return 0;
  if (months <= 0) return target - balance;
  const r = monthlyRate(annualReturnPct);
  if (r === 0) return (target - balance) / months;
  const g = Math.pow(1 + r, months);
  return Math.max(0, ((target - balance * g) * r) / (g - 1));
}

/** Balance after each month, starting with month 0 = today. */
export function projectSeries(
  balance: number,
  monthly: number,
  months: number,
  annualReturnPct = 0
): number[] {
  const r = monthlyRate(annualReturnPct);
  const out = [balance];
  let b = balance;
  for (let m = 1; m <= months; m++) {
    b = b * (1 + r) + monthly;
    out.push(b);
  }
  return out;
}

/** YYYY-MM-DD plus n whole months (day clamped to the month's length). */
export function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Whole months from `from` to `to` (rounded down, never below 0). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const m = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, m);
}

export interface Milestone {
  pct: number; // 25 | 50 | 75 | 100
  amount: number;
  reached: boolean;
  eta: string | null; // YYYY-MM-DD when expected; null = reached or never
}

export function milestones(
  balance: number,
  target: number,
  monthly: number,
  today: string,
  annualReturnPct = 0
): Milestone[] {
  return [25, 50, 75, 100].map((pct) => {
    const amount = (target * pct) / 100;
    if (balance >= amount) return { pct, amount, reached: true, eta: null };
    const n = monthsToTarget(balance, amount, monthly, annualReturnPct);
    return { pct, amount, reached: false, eta: n == null ? null : addMonths(today, n) };
  });
}

export type TrackState = "done" | "on-track" | "behind" | "no-date" | "no-pace";

/** On-track check against an optional target date. `gap` = extra kr/month needed. */
export function trackStatus(
  balance: number,
  target: number,
  monthly: number,
  today: string,
  targetDate: string | null,
  annualReturnPct = 0
): { state: TrackState; needed: number | null; gap: number | null } {
  if (balance >= target) return { state: "done", needed: 0, gap: 0 };
  if (!targetDate) return { state: monthly > 0 ? "no-date" : "no-pace", needed: null, gap: null };
  const needed = requiredMonthly(balance, target, monthsBetween(today, targetDate), annualReturnPct);
  const gap = Math.max(0, needed - Math.max(0, monthly));
  return { state: gap <= 0.5 ? "on-track" : "behind", needed, gap };
}

/** "Mar 2029" for an ISO date; "—" for null. Safe on server and client. */
export function fmtMonthYear(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
