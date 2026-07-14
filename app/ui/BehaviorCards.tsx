import Link from "next/link";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";
import { kr, shortDate } from "@/lib/format";
import { AsciiBar } from "./AsciiBar";
import { Panel } from "./Panel";
import type { GoalSummary } from "@/lib/savings";
import { dismissAnomaly } from "@/app/actions";

export function PrimaryGoalCard({ goal }: { goal: GoalSummary }) {
  return (
    <Panel title={`GOAL: ${goal.name.toUpperCase()}`} right="PRIMARY">
      <Link href={`/goals/${goal.id}`} className="flex gap-4">
        <div className="h-20 w-20 shrink-0 border border-edge bg-panel2">
          {goal.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={goal.imageUrl} alt={goal.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-edge2">
              ◈
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <AsciiBar ratio={goal.progressPct} width={20} tone="accent2" />
          <div className="flex justify-between text-xs text-muted">
            <span className="tabular-nums">
              {kr(goal.current)} / {kr(goal.target)}
            </span>
            {goal.monthsToGoal != null && goal.monthsToGoal < 240 ? (
              <span>ETA {Math.ceil(goal.monthsToGoal)}mo</span>
            ) : (
              <span className="text-faint">no velocity</span>
            )}
          </div>
        </div>
      </Link>
    </Panel>
  );
}

export async function FlaggedCard() {
  const rows = await db
    .select({
      id: transactions.id,
      merchant: transactions.counterpartyName,
      amount: sql<number>`${transactions.amount}::float`,
      bookingDate: transactions.bookingDate,
      flaggedReason: transactions.flaggedReason,
    })
    .from(transactions)
    .where(isNotNull(transactions.flaggedReason))
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(4);

  if (rows.length === 0) return null;

  return (
    <Panel title="ANOMALIES" right={`${rows.length} [!]`}>
      <table className="term-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="w-16 whitespace-nowrap text-muted">{shortDate(r.bookingDate)}</td>
              <td>
                <div className="truncate text-ink2">{r.merchant ?? "—"}</div>
                <div className="truncate text-[0.7rem] text-danger">{r.flaggedReason}</div>
              </td>
              <td className="w-24 text-right text-danger">−{kr(r.amount)}</td>
              <td className="w-6 text-right">
                <form action={dismissAnomaly}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    title="Dismiss anomaly"
                    className="cursor-pointer border-none bg-transparent p-0 text-[0.7rem] leading-none text-faint hover:text-muted"
                  >
                    ×
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link
        href="/transactions"
        className="mt-2 inline-block text-[0.7rem] uppercase tracking-term text-accent2 hover:underline"
      >
        » review ledger
      </Link>
    </Panel>
  );
}
