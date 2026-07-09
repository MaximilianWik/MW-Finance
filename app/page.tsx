import Link from "next/link";
import { db } from "@/db";
import { aiInsights } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAccounts, getCategories } from "@/lib/queries";
import { getMonthlyBudgetStatus } from "@/lib/budget";
import { getPrimaryGoal, getSavingsTotal } from "@/lib/savings";
import { kr } from "@/lib/format";
import { SyncButton } from "./ui/SyncButton";
import { BudgetBar } from "./ui/BudgetBar";
import { RecentLedger } from "./ui/RecentLedger";
import { Panel } from "./ui/Panel";
import { StatusTag } from "./ui/StatusTag";
import { PrimaryGoalCard, FlaggedCard } from "./ui/BehaviorCards";
import { SavingsPanel } from "./ui/SavingsPanel";
import { AiInsights, type AiInsightRow } from "./ui/AiInsights";
import { QueryLog } from "./ui/QueryLog";
import { AsciiSigil } from "./ui/AsciiSigil";
import { withQueryLog } from "@/db/query-log";

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
        <div className="mb-3 flex justify-center overflow-hidden">
          <AsciiSigil name="figure01" tone="accent" opacity={0.8} className="text-[0.65rem]" />
        </div>
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
    label: "", ym: "", from: "", to: null, rows: [], totalSpent: 0, totalBudget: 0,
  };
  let cats: Awaited<ReturnType<typeof getCategories>> = [];
  let primaryGoal: Awaited<ReturnType<typeof getPrimaryGoal>> = null;
  let savings: Awaited<ReturnType<typeof getSavingsTotal>> = {
    fromTransactions: 0, fromManual: 0, total: 0, recentEntries: [],
  };
  let dbError: string | null = null;
  let topInsights: AiInsightRow[] = [];
  const t0 = Date.now();

  const [, _ql] = await withQueryLog(async () => {
    try {
      [accs, budget, cats, primaryGoal, savings] = await Promise.all([
        getAccounts(),
        getMonthlyBudgetStatus(),
        getCategories(),
        getPrimaryGoal(),
        getSavingsTotal(),
      ]);
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
      return;
    }
    try {
      topInsights = await db
        .select({
          id: aiInsights.id,
          kind: aiInsights.kind,
          severity: aiInsights.severity,
          title: aiInsights.title,
          body: aiInsights.body,
        })
        .from(aiInsights)
        .where(eq(aiInsights.dismissed, false))
        .orderBy(desc(aiInsights.createdAt), desc(aiInsights.id))
        .limit(4);
    } catch {
      // AI insights are non-critical — never block the dashboard on them.
    }
  });
  const queryLog = _ql;
  const tookMs = Date.now() - t0;

  if (dbError) {
    return (
      <Panel title="DATABASE ERROR" className="mt-2">
        <div className="mb-3 flex justify-center overflow-hidden">
          <AsciiSigil name="figure04" tone="accent" opacity={0.8} className="text-[0.65rem]" />
        </div>
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
  const totalBalance = accs.reduce((s, a) => s + (a.balance ?? 0), 0);  const budgetRows = budget.rows
    .filter((r) => r.name !== "Transfers" && (r.budget != null || r.spent > 0))
    .sort((a, b) => (b.budget != null ? 1 : 0) - (a.budget != null ? 1 : 0));
  const todayIso = new Date().toISOString().slice(0, 10);
  const cycleRange = { from: budget.from || todayIso, to: budget.to ?? todayIso };

  return (
    <main className="flex flex-col gap-4">
      <QueryLog queries={queryLog.map((q) => q.sql)} tookMs={tookMs} page="OVERVIEW" />
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
          <div className="mb-2 flex justify-center overflow-hidden">
            <AsciiSigil name="figure04" tone="accent" opacity={0.8} className="text-[0.65rem]" />
          </div>
          <p className="text-sm text-muted">No bank linked. Connect via Enable Banking.</p>
          <a href="/api/auth/start" className="btn btn-accent mt-3">
            $ link bank
          </a>
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
                      {a.balanceUpdatedAt === null ? (
                        <StatusTag tone="muted">[ NEW ]</StatusTag>
                      ) : syncFresh(a.balanceUpdatedAt) ? (
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SyncButton />
              <a
                href="/api/auth/start"
                className="btn text-[0.65rem]"
                title="Re-authorise with Länsförsäkringar (required every 90 days)"
              >
                $ re-link bank
              </a>
            </div>
          </Panel>

          {primaryGoal ? (
            <PrimaryGoalCard goal={primaryGoal} />
          ) : (
            <Panel title="GOALS">
              <div className="mb-2 flex justify-center overflow-hidden">
                <AsciiSigil name="figure00" tone="accent" opacity={0.8} className="text-[0.65rem]" />
              </div>
              <p className="text-sm text-muted">No primary goal set.</p>
              <Link href="/goals" className="btn mt-3">
                » goals
              </Link>
            </Panel>
          )}
        </div>
      )}

      <FlaggedCard />

      {topInsights.length > 0 && (
        <Panel
          title="AI INSIGHTS"
          right={<Link href="/insights" className="text-accent2 hover:underline">» all</Link>}
        >
          <AiInsights initial={topInsights} />
        </Panel>
      )}

      <SavingsPanel initial={savings} />

      {budgetRows.length > 0 && (
        <Panel title="MONTHLY BUDGET" right={`${kr(budget.totalSpent)} / ${kr(budget.totalBudget)}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {budgetRows.map((r) => (
                  <BudgetBar key={r.categoryId} row={r} range={cycleRange} />
                ))}
              </tbody>
            </table>
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
        <RecentLedger options={options} />
      </Panel>
    </main>
  );
}
