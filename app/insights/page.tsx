import { db } from "@/db";
import { recurringPayments } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { getMonthComparison } from "@/lib/comparison";
import { monthRange } from "@/lib/budget";
import { kr, krSigned, pct, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const { ym, label } = monthRange();

  const [comparison, recurrings] = await Promise.all([
    getMonthComparison(ym),
    db
      .select({
        id: recurringPayments.id,
        merchant: recurringPayments.merchant,
        amount: sql<number>`${recurringPayments.amount}::float`,
        cadence: recurringPayments.cadence,
        cadenceDays: recurringPayments.cadenceDays,
        nextDate: recurringPayments.nextDate,
        lastDate: recurringPayments.lastDate,
        occurrences: recurringPayments.occurrences,
      })
      .from(recurringPayments)
      .orderBy(desc(recurringPayments.amount)),
  ]);

  const changedRows = comparison.rows
    .filter((r) => r.spentThis > 0 || r.spentPrev > 0)
    .sort((a, b) => Math.abs(b.deltaKr) - Math.abs(a.deltaKr));

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-xs text-muted">{label}</p>
      </header>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">vs {comparison.previousMonth}</h2>
          <span className={"text-sm tabular-nums " + trendColor(comparison.totalDelta)}>
            {krSigned(comparison.totalDelta)}{" "}
            {comparison.totalDeltaPct != null && (
              <span className="text-xs text-muted">
                ({comparison.totalDeltaPct >= 0 ? "+" : ""}
                {pct(comparison.totalDeltaPct)})
              </span>
            )}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-xs text-muted">
          <span>{kr(comparison.totalThis)} this month</span>
          <span>{kr(comparison.totalPrev)} last month</span>
        </div>

        <ul className="mt-3 divide-y divide-edge/40">
          {changedRows.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">
              No spending recorded yet.
            </li>
          ) : (
            changedRows.map((r) => (
              <li key={r.categoryId} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span>{r.emoji}</span>
                  <span className="text-white">{r.name}</span>
                </span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-muted">{kr(r.spentPrev)}</span>
                  <span className="text-muted">→</span>
                  <span>{kr(r.spentThis)}</span>
                  <span className={trendColor(r.deltaKr)}>
                    {krSigned(r.deltaKr)}
                    {r.deltaPct != null && (
                      <span className="ml-1 text-xs text-muted">
                        ({r.deltaPct >= 0 ? "+" : ""}
                        {pct(r.deltaPct)})
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-medium">Recurring payments</h2>
          <span className="text-xs text-muted">{recurrings.length}</span>
        </div>
        {recurrings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nothing detected yet — need at least 3 charges from the same merchant.
          </p>
        ) : (
          <ul className="divide-y divide-edge/40">
            {recurrings.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate text-white">{r.merchant}</span>
                  <span className="tabular-nums">−{kr(r.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>
                    {r.cadence}
                    {r.cadenceDays ? ` · ~${r.cadenceDays}d` : ""} · {r.occurrences} seen
                  </span>
                  <span>
                    next {shortDate(r.nextDate)} · last {shortDate(r.lastDate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function trendColor(delta: number): string {
  if (Math.abs(delta) < 1) return "text-muted";
  return delta > 0 ? "text-amber-400" : "text-emerald-400";
}
