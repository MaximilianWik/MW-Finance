import Link from "next/link";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";
import { kr, shortDate } from "@/lib/format";
import type { GoalSummary } from "@/lib/savings";

export function PrimaryGoalCard({ goal }: { goal: GoalSummary }) {
  return (
    <Link
      href={`/goals/${goal.id}`}
      className="card flex gap-4 transition hover:border-accent/40"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-panel2">
        {goal.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={goal.imageUrl} alt={goal.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl text-muted">
            ◇
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-baseline justify-between">
          <h3 className="truncate font-medium">{goal.name}</h3>
          <span className="text-xs text-muted">{Math.round(goal.progressPct * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.max(goal.progressPct * 100, 2)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted">
          <span className="tabular-nums">
            {kr(goal.current)} / {kr(goal.target)}
          </span>
          {goal.monthsToGoal != null && goal.monthsToGoal < 240 && (
            <span>{Math.ceil(goal.monthsToGoal)}mo</span>
          )}
        </div>
      </div>
    </Link>
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
    .limit(3);

  if (rows.length === 0) return null;

  return (
    <section className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-medium">Flagged</h2>
        <Link href="/transactions" className="text-xs text-accent2 hover:underline">
          Review
        </Link>
      </div>
      <ul className="divide-y divide-edge/40">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="truncate text-white">{r.merchant ?? "—"}</span>
              <span className="tabular-nums text-danger">−{kr(r.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>{r.flaggedReason}</span>
              <span>{shortDate(r.bookingDate)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
