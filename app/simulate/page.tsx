import { getCategories } from "@/lib/queries";
import { SimulateForm } from "../ui/SimulateForm";

export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const cats = await getCategories();
  const options = cats
    .filter((c) => c.name !== "Income" && c.name !== "Transfers")
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }));

  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">What-if</h1>
        <p className="text-xs text-muted">Try a hypothetical purchase before you make it.</p>
      </header>
      <SimulateForm categories={options} />
    </main>
  );
}
