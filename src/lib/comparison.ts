import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

function monthRange(month: string) {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export interface CategoryComparison {
  categoryId: number;
  name: string;
  emoji: string;
  color: string;
  spentThis: number;
  spentPrev: number;
  deltaKr: number; // spentThis - spentPrev
  deltaPct: number | null; // null when spentPrev === 0
}

export interface MonthComparison {
  month: string; // current
  previousMonth: string;
  rows: CategoryComparison[];
  totalThis: number;
  totalPrev: number;
  totalDelta: number;
  totalDeltaPct: number | null;
}

/** Per-category spend comparison between `month` and `month - 1`. */
export async function getMonthComparison(month: string): Promise<MonthComparison> {
  const previousMonth = prevMonth(month);
  const cur = monthRange(month);
  const prev = monthRange(previousMonth);

  const spentThisExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${cur.from} and ${cur.to} then ${transactions.signed} else 0 end), 0)::float`;
  const spentPrevExpr = sql<number>`coalesce(-sum(case when ${transactions.signed} < 0 and ${transactions.bookingDate} between ${prev.from} and ${prev.to} then ${transactions.signed} else 0 end), 0)::float`;

  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      emoji: categories.emoji,
      color: categories.color,
      spentThis: spentThisExpr,
      spentPrev: spentPrevExpr,
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.sort);

  const out: CategoryComparison[] = rows.map((r) => {
    const deltaKr = r.spentThis - r.spentPrev;
    const deltaPct = r.spentPrev === 0 ? null : deltaKr / r.spentPrev;
    return {
      categoryId: r.categoryId,
      name: r.name,
      emoji: r.emoji,
      color: r.color,
      spentThis: r.spentThis,
      spentPrev: r.spentPrev,
      deltaKr,
      deltaPct,
    };
  });

  const totalThis = out.reduce((s, r) => s + r.spentThis, 0);
  const totalPrev = out.reduce((s, r) => s + r.spentPrev, 0);
  const totalDelta = totalThis - totalPrev;
  const totalDeltaPct = totalPrev === 0 ? null : totalDelta / totalPrev;

  return {
    month,
    previousMonth,
    rows: out,
    totalThis,
    totalPrev,
    totalDelta,
    totalDeltaPct,
  };
}
