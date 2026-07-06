"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

export interface EditableCategory {
  id: number;
  name: string;
  emoji: string;
  color: string;
  budgetMonthly: string | null;
  spent: number;
}

export function BudgetEditor({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(categories);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("💸");
  const [newBudget, setNewBudget] = useState("");

  async function saveBudget(id: number, value: string) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, budgetMonthly: value === "" ? null : value }),
    });
    start(() => router.refresh());
  }

  async function addCategory() {
    if (!newName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        emoji: newEmoji || "💸",
        budgetMonthly: newBudget || null,
      }),
    });
    if (res.ok) {
      const { category } = await res.json();
      setRows((r) => [...r, { ...category, spent: 0 }]);
      setNewName("");
      setNewEmoji("💸");
      setNewBudget("");
      start(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <div className="divide-y divide-edge/40">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="text-lg">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{c.name}</div>
                <div className="text-[11px] text-muted">spent {kr(c.spent)}</div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={c.budgetMonthly ?? ""}
                  placeholder="—"
                  onBlur={(e) => {
                    if (e.target.value !== (c.budgetMonthly ?? "")) {
                      saveBudget(c.id, e.target.value);
                    }
                  }}
                  className="input w-24 text-right tabular-nums"
                />
                <span className="text-xs text-muted">kr</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-medium">New category</h2>
        <div className="flex items-center gap-2">
          <input
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            className="input w-14 text-center"
            aria-label="Emoji"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="input flex-1"
          />
          <input
            type="number"
            value={newBudget}
            onChange={(e) => setNewBudget(e.target.value)}
            placeholder="Budget"
            className="input w-24 text-right tabular-nums"
          />
          <button className="btn btn-accent" onClick={addCategory} disabled={pending}>
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
