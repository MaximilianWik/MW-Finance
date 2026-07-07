import Link from "next/link";
import { getAccounts, listTransactions, getCategories } from "@/lib/queries";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getPrimaryGoal } from "@/lib/savings";
import { kr } from "@/lib/format";
import { SyncButton } from "./ui/SyncButton";
import { BudgetBar } from "./ui/BudgetBar";
import { TxRow } from "./ui/TxRow";
import { PrimaryGoalCard, FlaggedCard } from "./ui/BehaviorCards";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="card mt-8">
        <h1 className="text-lg font-semibold">Setup needed</h1>
        <p className="mt-2 text-sm text-muted">
          Copy <code className="text-accent2">.env.example</code> to{" "}
          <code className="text-accent2">.env.local</code>, fill it in, run{" "}
          <code className="text-accent2">npm run db:push</code> and{" "}
          <code className="text-accent2">npm run db:seed</code>, then reload.
        </p>
      </div>
    );
  }

  let accs: Awaited<ReturnType<typeof getAccounts>> = [];
  let budget: Awaited<ReturnType<typeof getMonthlyBudgetStatus>> = {
    label: "",
    ym: "",
    rows: [],
    totalSpent: 0,
    totalBudget: 0,
  };
  let txs: Awaited<ReturnType<typeof listTransactions>> = [];
  let cats: Awaited<ReturnType<typeof getCategories>> = [];
  let primaryGoal: Awaited<ReturnType<typeof getPrimaryGoal>> = null;
  let dbError: string | null = null;

  try {
    [accs, budget, txs, cats, primaryGoal] = await Promise.all([
      getAccounts(),
      getMonthlyBudgetStatus(),
      listTransactions({ limit: 12 }),
      getCategories(),
      getPrimaryGoal(),
    ]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  if (dbError) {
    return (
      <div className="card mt-8">
        <h1 className="text-lg font-semibold text-danger">Database error</h1>
        <p className="mt-2 text-sm text-muted">
          Tables likely don&apos;t exist yet. Run these locally (with your production{" "}
          <code className="text-accent2">DATABASE_URL</code>) then redeploy:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-accent2">
          npm run db:push{"\n"}npm run db:seed
        </pre>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">Error detail</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-ink p-2 text-[11px] text-danger/80">
            {dbError}
          </pre>
        </details>
      </div>
    );
  }

  const options = cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
  }));
  const totalBalance = accs.reduce((s, a) => s + (a.balance ?? 0), 0);
  const budgetRows = budget.rows.filter((r) => r.budget != null || r.spent > 0);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">MWFinance</h1>
          <p className="text-xs text-muted">{budget.label}</p>
        </div>
        {accs.length > 0 ? (
          <SyncButton />
        ) : (
          <Link href="/api/auth/start" className="btn btn-accent">
            Link bank
          </Link>
        )}
      </header>

      {sp.linked && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
          Linked {sp.linked} account{sp.linked === "1" ? "" : "s"}. Hit “Sync now”.
        </div>
      )}
      {sp.error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {sp.error}
        </div>
      )}

      {accs.length === 0 ? (
        <div className="card">
          <h2 className="font-medium">No bank linked yet</h2>
          <p className="mt-1 text-sm text-muted">
            Connect your bank via Enable Banking to pull in accounts and transactions.
          </p>
          <Link href="/api/auth/start" className="btn btn-accent mt-4">
            Link a bank
          </Link>
        </div>
      ) : (
        <section className="card">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Total balance</span>
            <span className="text-2xl font-semibold tabular-nums">{kr(totalBalance)}</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {accs.map((a) => (
              <div
                key={a.uid}
                className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-white">
                    {a.name ?? a.product ?? a.aspspName}
                  </div>
                  <div className="truncate text-[11px] text-muted">{a.iban ?? a.aspspName}</div>
                </div>
                <span className="tabular-nums text-white">
                  {kr(a.balance)} <span className="text-muted">{a.currency}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {budgetRows.length > 0 && (
        <section className="card">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-medium">Budgets</h2>
            <span className="text-xs text-muted">
              {kr(budget.totalSpent)} / {kr(budget.totalBudget)}
            </span>
          </div>
          <div className="divide-y divide-edge/40">
            {budgetRows.map((r) => (
              <BudgetBar key={r.categoryId} row={r} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/budgets" className="btn flex-1">
              Edit budgets
            </Link>
            <Link href="/simulate" className="btn flex-1">
              What-if
            </Link>
          </div>
        </section>
      )}

      {primaryGoal && <PrimaryGoalCard goal={primaryGoal} />}

      <FlaggedCard />

      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-medium">Recent</h2>
          <Link href="/transactions" className="text-xs text-accent2 hover:underline">
            View all
          </Link>
        </div>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No transactions yet. Link a bank and sync.
          </p>
        ) : (
          <ul>
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} options={options} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
