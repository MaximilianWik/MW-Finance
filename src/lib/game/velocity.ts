import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { ACHIEVEMENTS, type AchievementContext } from "./achievements";
import { TIERS, XP_PER_100_KR, XP_PER_100_KR_INVEST } from "./level";

// ─── Next milestone ─────────────────────────────────────────────────────────

interface MilestoneSpec {
  id: string;
  getValue: (ctx: AchievementContext & { xp: number }) => number;
  target: number;
  unit: "kr" | "d" | "challenges" | "XP";
}

// Each entry maps an achievement id to a single numeric progress value.
const SPECS: MilestoneSpec[] = [
  { id: "first_spark",      target: 1,        unit: "kr",         getValue: c => c.savingsTotal },
  { id: "saver_5k",         target: 5000,     unit: "kr",         getValue: c => c.savingsTotal },
  { id: "saver_10k",        target: 10000,    unit: "kr",         getValue: c => c.savingsTotal },
  { id: "saver_50k",        target: 50000,    unit: "kr",         getValue: c => c.savingsTotal },
  { id: "saver_100k",       target: 100000,   unit: "kr",         getValue: c => c.savingsTotal },
  { id: "saver_200k",       target: 200000,   unit: "kr",         getValue: c => c.savingsTotal },
  { id: "first_investment", target: 1,        unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_10k",       target: 10000,    unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_50k",       target: 50000,    unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_100k",      target: 100000,   unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "invest_250k",      target: 250000,   unit: "kr",         getValue: c => c.investmentsTotal },
  { id: "total_50k",        target: 50000,    unit: "kr",         getValue: c => c.savingsTotal + c.investmentsTotal },
  { id: "total_200k",       target: 200000,   unit: "kr",         getValue: c => c.savingsTotal + c.investmentsTotal },
  { id: "total_500k",       target: 500000,   unit: "kr",         getValue: c => c.savingsTotal + c.investmentsTotal },
  { id: "uptime_3",         target: 3,        unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_7",         target: 7,        unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_14",        target: 14,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_30",        target: 30,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_60",        target: 60,       unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_100",       target: 100,      unit: "d",          getValue: c => c.bestStreak },
  { id: "uptime_200",       target: 200,      unit: "d",          getValue: c => c.bestStreak },
  { id: "capacitor",        target: 2000,     unit: "kr",         getValue: c => c.potCharge },
  { id: "capacitor_5k",     target: 5000,     unit: "kr",         getValue: c => c.potCharge },
  { id: "first_challenge",  target: 1,        unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_5",      target: 5,        unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_10",     target: 10,       unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "challenge_25",     target: 25,       unit: "challenges", getValue: c => c.challengesCompleted },
  { id: "ignition",         target: TIERS[2].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "overdrive",        target: TIERS[5].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "fusion",           target: TIERS[6].minXp,  unit: "XP", getValue: c => c.xp },
  { id: "singularity",      target: TIERS[7].minXp,  unit: "XP", getValue: c => c.xp },
];

const SPEC_BY_ID = new Map(SPECS.map((s) => [s.id, s]));
const ACH_BY_ID  = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

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

// ─── Wealth velocity ─────────────────────────────────────────────────────────

export interface VelocityInfo {
  krPerMonth: number;      // rolling 3-month avg new savings + investments
  label: string;           // formatted "X kr/month"
  projectedMonths: number | null; // months to next XP tier at this velocity
  projectedTierName: string | null;
}

function fmtKr(n: number) {
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

function isoMonth(offset: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export async function getWealthVelocity(
  currentXp: number,
  currentTierIndex: number
): Promise<VelocityInfo> {
  // Sum savings + investments outflows for the last 3 complete months.
  const months = [isoMonth(-1), isoMonth(-2), isoMonth(-3)];
  const outflowExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.bookingDate}, 'YYYY-MM')`,
      catName: categories.name,
      total: outflowExpr,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        sql`to_char(${transactions.bookingDate}, 'YYYY-MM') IN (${months[0]}, ${months[1]}, ${months[2]})`,
        sql`${categories.name} IN ('Savings','Investments')`
      )
    )
    .groupBy(
      sql`to_char(${transactions.bookingDate}, 'YYYY-MM')`,
      categories.name
    );

  // Total per month.
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.total);
  }
  const totals = months.map((m) => byMonth.get(m) ?? 0);
  const avgMonthly = totals.reduce((s, n) => s + n, 0) / 3;

  // How many months to next tier?
  const next = currentTierIndex < TIERS.length - 1 ? TIERS[currentTierIndex + 1] : null;
  let projectedMonths: number | null = null;
  let projectedTierName: string | null = null;
  if (next && avgMonthly > 0) {
    // Each month adds avgMonthly in savings and assume half goes to investments.
    const savMonthly = avgMonthly * 0.5;
    const invMonthly = avgMonthly * 0.5;
    const xpPerMonth = (savMonthly / 100) * XP_PER_100_KR + (invMonthly / 100) * XP_PER_100_KR_INVEST;
    const xpNeeded = next.minXp - currentXp;
    projectedMonths = xpNeeded > 0 && xpPerMonth > 0 ? Math.ceil(xpNeeded / xpPerMonth) : null;
    projectedTierName = next.name;
  }

  return {
    krPerMonth: avgMonthly,
    label: avgMonthly > 0 ? `${fmtKr(avgMonthly)}/month` : "no data",
    projectedMonths,
    projectedTierName,
  };
}

// ─── Fuel efficiency ─────────────────────────────────────────────────────────

export interface EfficiencyInfo {
  pct: number | null;     // 0..1 of salary going to savings+investments (null = no salary)
  monthlySavingsInvest: number;
  salary: number | null;
}

const SALARY_MIN = 18_000;
const SALARY_MAX = 30_000;

export async function getFuelEfficiency(): Promise<EfficiencyInfo> {
  const month = isoMonth(0);
  const [salaryRow] = await db
    .select({ amount: sql<number>`coalesce(avg(${transactions.amount}::float), 0)::float` })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.direction, "CRDT"),
        eq(categories.name, "Income"),
        sql`${transactions.amount}::float between ${SALARY_MIN} and ${SALARY_MAX}`,
        gte(transactions.bookingDate, isoMonth(-3) + "-01")
      )
    );
  const salary = salaryRow?.amount > 0 ? salaryRow.amount : null;

  const outflowExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 then ${transactions.signed} else 0 end), 0)::float`;
  const [siRow] = await db
    .select({ total: outflowExpr })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        sql`to_char(${transactions.bookingDate}, 'YYYY-MM') = ${month}`,
        sql`${categories.name} IN ('Savings','Investments')`
      )
    );
  const monthly = siRow?.total ?? 0;

  return {
    pct: salary && salary > 0 ? Math.min(1, monthly / salary) : null,
    monthlySavingsInvest: monthly,
    salary,
  };
}
