import { db } from "@/db";
import { recurringPayments } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { getMonthComparison, getWeekComparison, type CategoryComparison } from "@/lib/comparison";
import { getBillsChecklist } from "@/lib/behavior/checklist";
import { monthRange } from "@/lib/budget";
import { kr, krSigned, pct, shortDate } from "@/lib/format";
import { Panel } from "../ui/Panel";
import { StatusTag, Glyph } from "../ui/StatusTag";

export const dynamic = "force-dynamic";

function trendColor(delta: number): string {
  if (Math.abs(delta) < 1) return "text-muted";
  return delta > 0 ? "text-amber" : "text-accent";
}

function ComparisonTable({ rows }: { rows: CategoryComparison[] }) {
  const changed = rows
    .filter((r) => r.spentThis > 0 || r.spentPrev > 0)
    .sort((a, b) => Math.abs(b.deltaKr) - Math.abs(a.deltaKr));
  if (changed.length === 0) {
    return <p className="py-4 text-center text-sm text-muted">No spending recorded.</p>;
  }
  return (
    <table className="term-table">
      <thead>
        <tr>
          <th>CATEGORY</th>
          <th className="text-right">PREV</th>
          <th className="text-right">NOW</th>
          <th className="text-right">Δ KR</th>
          <th className="text-right">Δ %</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((r) => (
          <tr key={r.categoryId}>
            <td className="uppercase tracking-term">
              <span className="mr-2" style={{ color: r.color }}>
                ■
              </span>
              {r.name}
            </td>
            <td className="text-right text-muted">{kr(r.spentPrev)}</td>
            <td className="text-right text-ink2">{kr(r.spentThis)}</td>
            <td className={`text-right ${trendColor(r.deltaKr)}`}>{krSigned(r.deltaKr)}</td>
            <td className={`text-right ${trendColor(r.deltaKr)}`}>
              {r.deltaPct != null ? `${r.deltaPct >= 0 ? "+" : ""}${pct(r.deltaPct)}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function InsightsPage() {
  const { ym, label } = monthRange();

  const [mom, wow, bills, recurrings] = await Promise.all([
    getMonthComparison(ym),
    getWeekComparison(),
    getBillsChecklist(),
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

  const billGlyph = {
    paid: "ok",
    due: "empty",
    overdue: "warn",
    upcoming: "empty",
  } as const;
  const billTone = {
    paid: "ok",
    due: "muted",
    overdue: "danger",
    upcoming: "muted",
  } as const;

  return (
    <main className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="MONTH OVER MONTH"
          right={
            <span className={trendColor(mom.totalDelta)}>
              {krSigned(mom.totalDelta)}
              {mom.totalDeltaPct != null && ` ${mom.totalDeltaPct >= 0 ? "+" : ""}${pct(mom.totalDeltaPct)}`}
            </span>
          }
        >
          <p className="mb-2 text-[0.7rem] uppercase tracking-term text-faint">
            {label} vs {mom.previousMonth}
          </p>
          <ComparisonTable rows={mom.rows} />
        </Panel>

        <Panel
          title="WEEK OVER WEEK"
          right={
            <span className={trendColor(wow.totalDelta)}>
              {krSigned(wow.totalDelta)}
              {wow.totalDeltaPct != null && ` ${wow.totalDeltaPct >= 0 ? "+" : ""}${pct(wow.totalDeltaPct)}`}
            </span>
          }
        >
          <p className="mb-2 text-[0.7rem] uppercase tracking-term text-faint">
            {shortDate(wow.thisWeek.from)}–{shortDate(wow.thisWeek.to)} vs prev week
          </p>
          <ComparisonTable rows={wow.rows} />
        </Panel>
      </div>

      <Panel title="BILLS CHECKLIST" right={`${bills.paid}/${bills.total} PAID`}>
        {bills.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No recurring bills detected yet.
          </p>
        ) : (
          <table className="term-table">
            <tbody>
              {bills.items.map((b) => (
                <tr key={b.id}>
                  <td className="w-8">
                    <Glyph state={billGlyph[b.state]} />
                  </td>
                  <td className="uppercase tracking-term text-ink2">{b.merchant}</td>
                  <td className="w-24 text-right text-muted">−{kr(b.amount)}</td>
                  <td className="w-24 text-center">
                    <StatusTag tone={billTone[b.state]}>{b.state}</StatusTag>
                  </td>
                  <td className="w-20 text-right text-faint">{shortDate(b.expectedOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="RECURRING PAYMENTS" right={`${recurrings.length}`}>
        {recurrings.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Nothing detected — need ≥3 charges from one merchant.
          </p>
        ) : (
          <table className="term-table">
            <thead>
              <tr>
                <th>MERCHANT</th>
                <th className="text-right">AMOUNT</th>
                <th>CADENCE</th>
                <th className="text-right">SEEN</th>
                <th className="text-right">NEXT</th>
              </tr>
            </thead>
            <tbody>
              {recurrings.map((r) => (
                <tr key={r.id}>
                  <td className="uppercase tracking-term text-ink2">{r.merchant}</td>
                  <td className="text-right text-muted">−{kr(r.amount)}</td>
                  <td className="text-muted">
                    {r.cadence}
                    {r.cadenceDays ? ` ~${r.cadenceDays}d` : ""}
                  </td>
                  <td className="text-right text-muted">{r.occurrences}</td>
                  <td className="text-right text-faint">{shortDate(r.nextDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
