import Link from "next/link";
import { getAccounts, listTransactions, getCategories } from "@/lib/queries";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getPrimaryGoal } from "@/lib/savings";
import { kr } from "@/lib/format";
import { SyncButton } from "./ui/SyncButton";
import { BudgetBar } from "./ui/BudgetBar";
import { TxRow } from "./ui/TxRow";
import { Panel } from "./ui/Panel";
import { StatusTag } from "./ui/StatusTag";
import { PrimaryGoalCard, FlaggedCard } from "./ui/BehaviorCards";

export const dynamic = "force-dynamic";

function syncFresh(iso: string | Date | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Date.now() - t < 8 * 3600_000; // synced within 8h
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  if (!process.env.DATABASE_URL) {
    return (
      <Panel title="SETUP REQUIRED" className="mt-2">
        <p className="text-sm text-muted">
          Copy <code className="text-accent">.env.example</code> → {" "}
          <code className="text-accent">.env.local</code>, then run{" "}
          <code className="text-accent">npm run db:push</code> and{" "}
          <code className="text-accent">npm run db:seed</code>.
        </p>
      </Panel>
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
      <Panel title="DATABASE ERROR" className="mt-2">
        <p className="text-sm text-muted">
          Tables likely don&apos;t exist. Run{" "}
          <code className="text-accent">npm run db:push</code> then{" "}
          <code className="text-accent">npm run db:seed</code>.
        </p>
        <pre className="mt-2 overflow-x-auto border border-edge bg-ink p-2 text-[0.7rem] text-danger">
          {dbError}
        </pre>
      </Panel>
    );
  }

  const options = cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const totalBalance = accs.reduce((s, a) => s + (a.balance ?? 0), 0);
  const budgetRows = budget.rows.filter((r) => r.budget != null || r.spent > 0);

  return (
    <main className="flex flex-col gap-4">
      {sp.linked && (
        <div className="border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs uppercase tracking-term text-accent">
          [ OK ] linked {sp.linked} account(s) — run $ sync now
        </div>
      )}
      {sp.error && (
        <div className="border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs uppercase tracking-term text-danger">
          [ FAIL ] {sp.error}
        </div>
      )}

      {accs.length === 0 ? (
        <Panel title="ACCOUNT SYNC">
          <p className="text-sm text-muted">No bank linked. Connect via Enable Banking.</p>
          <Link href="/api/auth/start" className="btn btn-accent mt-3">
            $ link bank
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="ACCOUNT SYNC" right={kr(totalBalance)}>
            <table className="term-table">
              <tbody>
                {accs.map((a) => (
                  <tr key={a.uid}>
                    <td>
                      <div className="truncate text-ink2">
                        {a.name ?? a.product ?? a.aspspName}
                      </div>
                      <div className="truncate text-[0.7rem] text-faint">
                        {a.iban ?? a.aspspName}
                      </div>
                    </td>
                    <td className="w-20 text-center">
                      {syncFresh(a.balanceUpdatedAt) ? (
                        <StatusTag tone="ok">[ OK ]</StatusTag>
                      ) : (
                        <StatusTag tone="warn">[ STALE ]</StatusTag>
                      )}
                    </td>
                    <td className="w-28 text-right text-ink2">{kr(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3">
              <SyncButton />
            </div>
          </Panel>

          {primaryGoal ? (
            <PrimaryGoalCard goal={primaryGoal} />
          ) : (
            <Panel title="GOALS">
              <p className="text-sm text-muted">No primary goal set.</p>
              <Link href="/goals" className="btn mt-3">
                » goals
              </Link>
            </Panel>
          )}
        </div>
      )}

      <FlaggedCard />

      {budgetRows.length > 0 && (
        <Panel title="MONTHLY BUDGET" right={`${kr(budget.totalSpent)} / ${kr(budget.totalBudget)}`}>
          <div className="divide-y divide-grid">
            {budgetRows.map((r) => (
              <BudgetBar key={r.categoryId} row={r} />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/budgets" className="btn">
              » budgets
            </Link>
            <Link href="/simulate" className="btn">
              » what-if
            </Link>
          </div>
        </Panel>
      )}

      <Panel title="RECENT LEDGER" right={<Link href="/transactions" className="text-accent2 hover:underline">» all</Link>}>
        {txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No transactions yet.</p>
        ) : (
          <table className="term-table">
            <tbody>
              {txs.map((t) => (
                <TxRow key={t.id} tx={t} options={options} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
