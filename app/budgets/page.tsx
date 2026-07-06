import { getMonthlyBudgetStatus } from "@/lib/budget";
import { BudgetEditor, type EditableCategory } from "../ui/BudgetEditor";
import { getCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [cats, status] = await Promise.all([getCategories(), getMonthlyBudgetStatus()]);
  const spentByCat = new Map(status.rows.map((r) => [r.categoryId, r.spent]));

  const rows: EditableCategory[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    budgetMonthly: c.budgetMonthly,
    spent: spentByCat.get(c.id) ?? 0,
  }));

  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Budgets</h1>
        <p className="text-xs text-muted">{status.label} · edit monthly limits</p>
      </header>
      <BudgetEditor categories={rows} />
    </main>
  );
}
