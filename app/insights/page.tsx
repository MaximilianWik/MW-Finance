import { Suspense } from "react";
import { db } from "@/db";
import { recurringPayments, aiInsights } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getMonthComparison, getWeekComparison, type CategoryComparison } from "@/lib/comparison";
import { getBillsChecklist } from "@/lib/behavior/checklist";
import { monthRange } from "@/lib/budget";
import { kr, krSigned, pct, shortDate } from "@/lib/format";
import { Panel } from "../ui/Panel";
import { StatusTag } from "../ui/StatusTag";
import { BillRow } from "../ui/RecurringActions";
import { ChecklistMonthNav } from "../ui/ChecklistMonthNav";
import { AiConsole } from "../ui/AiConsole";
import { AiInsights } from "../ui/AiInsights";
import { RecurringNote } from "../ui/RecurringNote";

export const dynamic = "force-dynamic";

/** delta > 0 = spent more = bad (red) for normal categories.
 *  reversed = true for Savings: spending more is good (green). */
function trendColor(delta: number, reversed = false): string {
  if (Math.abs(delta) < 1) return "text-muted";
  const worse = reversed ? delta < 0 : delta > 0;
  return worse ? "text-danger" : "text-ok";
}

function ComparisonTable({ rows }: { rows: CategoryComparison[] }) {
  const changed = rows
    .filter((r) => r.name !== "Transfers" && (r.spentThis > 0 || r.spentPrev > 0))
    .sort((a, b) => Math.abs(b.deltaKr) - Math.abs(a.deltaKr));

  if (changed.length === 0) {
    return <p className="py-4 text-center text-sm text-muted">No spending recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
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
              <span className="mr-2" style={{ color: r.color }}>■</span>
              {r.name}
            </td>
            <td className="text-right text-muted">{kr(r.spentPrev)}</td>
            <td className="text-right text-ink2">{kr(r.spentThis)}</td>
            <td className={`text-right ${trendColor(r.deltaKr, r.name === "Savings")}`}>{krSigned(r.deltaKr)}</td>
            <td className={`text-right ${trendColor(r.deltaKr, r.name === "Savings")}`}>
              {r.deltaPct != null
                ? `${r.deltaPct >= 0 ? "+" : ""}${pct(r.deltaPct)}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ym, label } = monthRange();
  const billsMonth = sp.billsMonth ?? ym;

  const [mom, wow, bills, recurrings, insights] = await Promise.all([
    getMonthComparison(ym),
    getWeekComparison(),
    getBillsChecklist(billsMonth),
    db
      .select({
        id: recurringPayments.id,
        merchant: recurringPayments.merchant,
        notes: recurringPayments.notes,
        amount: sql<number>`${recurringPayments.amount}::float`,
        cadence: recurringPayments.cadence,
        cadenceDays: recurringPayments.cadenceDays,
        nextDate: recurringPayments.nextDate,
        lastDate: recurringPayments.lastDate,
        occurrences: recurringPayments.occurrences,
        manual: recurringPayments.manual,
        variableAmount: recurringPayments.variableAmount,
      })
      .from(recurringPayments)
      .where(eq(recurringPayments.active, true))
      .orderBy(desc(recurringPayments.amount)),
    db
      .select({
        id: aiInsights.id,
        kind: aiInsights.kind,
        severity: aiInsights.severity,
        title: aiInsights.title,
        body: aiInsights.body,
      })
      .from(aiInsights)
      .where(eq(aiInsights.dismissed, false))
      .orderBy(desc(aiInsights.createdAt), desc(aiInsights.id)),
  ]);

  const billMonthLabel = monthLabel(billsMonth);

  // Monthly commitment = sum of all active recurring amounts normalised to /mo.
  const monthlyTotal = Math.round(
    recurrings.reduce((s, r) => {
      const m =
        r.cadence === "weekly" ? r.amount * (52 / 12)
        : r.cadence === "yearly" ? r.amount / 12
        : r.amount; // monthly (default)
      return s + m;
    }, 0)
  );

  return (
    <main className="flex flex-col gap-4">
      <Panel title="AI ANALYSIS" right={insights.length > 0 ? `${insights.length} ACTIVE` : undefined}>
        <AiInsights initial={insights} />
        <div className="mt-3">
          <AiConsole endpoint="/api/analysis/run" label="$ run analysis" pendingLabel="analyzing…" />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="MONTH OVER MONTH"
          right={
            <span className={trendColor(mom.totalDelta)}>
              {krSigned(mom.totalDelta)}
              {mom.totalDeltaPct != null &&
                ` ${mom.totalDeltaPct >= 0 ? "+" : ""}${pct(mom.totalDeltaPct)}`}
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
              {wow.totalDeltaPct != null &&
                ` ${wow.totalDeltaPct >= 0 ? "+" : ""}${pct(wow.totalDeltaPct)}`}
            </span>
          }
        >
          <p className="mb-2 text-[0.7rem] uppercase tracking-term text-faint">
            {shortDate(wow.thisWeek.from)}–{shortDate(wow.thisWeek.to)} vs prev week
          </p>
          <ComparisonTable rows={wow.rows} />
        </Panel>
      </div>

      {/* Bills checklist with month nav */}
      <Panel
        title="BILLS CHECKLIST"
        right={
          <span className="text-muted">
            {bills.paid}/{bills.total} PAID
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Suspense>
            <ChecklistMonthNav
              currentMonth={billsMonth}
              label={billMonthLabel}
              isHistorical={bills.isHistorical}
            />
          </Suspense>
          {bills.isHistorical && (
            <StatusTag tone="muted">HISTORICAL</StatusTag>
          )}
        </div>

        {bills.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No recurring bills detected yet. Mark transactions as recurring from the ledger.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="term-table">
            <thead>
              <tr>
                <th className="w-7"></th>
                <th>MERCHANT</th>
                <th className="text-right">AMOUNT</th>
                <th className="w-20 text-center">STATUS</th>
                <th className="w-20 text-right">EXPECTED</th>
                <th className="text-right">MANAGE</th>
              </tr>
            </thead>
            <tbody>
              {bills.items.map((item) => (
                <BillRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>

      {/* Detected recurring payments */}
      <Panel title="RECURRING PAYMENTS" right={`${recurrings.length} DETECTED · ${kr(monthlyTotal)}/MO`}>
        {recurrings.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Nothing detected — need ≥3 charges from one merchant,
            or mark a transaction manually from the ledger.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="term-table">
            <thead>
              <tr>
                <th>MERCHANT</th>
                <th>NOTES / ALIAS</th>
                <th className="text-right">AMOUNT</th>
                <th>CADENCE</th>
                <th className="text-center">TYPE</th>
                <th className="text-right">NEXT</th>
              </tr>
            </thead>
            <tbody>
              {recurrings.map((r) => (
                <tr key={r.id}>
                  <td className="uppercase tracking-term text-ink2">{r.merchant}</td>
                  <td className="text-muted italic">
                    <RecurringNote id={r.id} initial={r.notes ?? null} />
                  </td>
                  <td className="text-right text-muted">−{kr(r.amount)}</td>
                  <td className="text-muted">
                    {r.cadence}{r.cadenceDays ? ` ~${r.cadenceDays}d` : ""}
                    {r.variableAmount && <span className="ml-1 text-accent2">· variable</span>}
                  </td>
                  <td className="text-center">
                    <StatusTag tone={r.manual ? "accent" : "muted"}>
                      {r.manual ? "manual" : "auto"}
                    </StatusTag>
                  </td>
                  <td className="text-right text-faint">{shortDate(r.nextDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
