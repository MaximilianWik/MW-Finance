"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

export interface EditableCategory {
  id: number;
  name: string;
  color: string;
  budgetMonthly: string | null;
  budgetWeekly: string | null;
  spent: number;
}

export function BudgetEditor({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(categories);
  const [newName, setNewName] = useState("");
  const [newMonthly, setNewMonthly] = useState("");
  const [newWeekly, setNewWeekly] = useState("");

  async function save(id: number, field: "budgetMonthly" | "budgetWeekly", value: string) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value === "" ? null : value }),
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
        budgetMonthly: newMonthly || null,
        budgetWeekly: newWeekly || null,
      }),
    });
    if (res.ok) {
      const { category } = await res.json();
      setRows((r) => [...r, { ...category, spent: 0 }]);
      setNewName("");
      setNewMonthly("");
      setNewWeekly("");
      start(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="term-table">
        <thead>
          <tr>
            <th>CATEGORY</th>
            <th className="text-right">SPENT (MO)</th>
            <th className="text-right">MONTHLY</th>
            <th className="text-right">WEEKLY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="uppercase tracking-term">
                <span className="mr-2" style={{ color: c.color }}>
                  ■
                </span>
                {c.name}
              </td>
              <td className="text-right text-muted">{kr(c.spent)}</td>
              <td className="text-right">
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={c.budgetMonthly ?? ""}
                  placeholder="—"
                  onBlur={(e) => {
                    if (e.target.value !== (c.budgetMonthly ?? "")) {
                      save(c.id, "budgetMonthly", e.target.value);
                    }
                  }}
                  className="input w-24 text-right tabular-nums"
                />
              </td>
              <td className="text-right">
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={c.budgetWeekly ?? ""}
                  placeholder="—"
                  onBlur={(e) => {
                    if (e.target.value !== (c.budgetWeekly ?? "")) {
                      save(c.id, "budgetWeekly", e.target.value);
                    }
                  }}
                  className="input w-24 text-right tabular-nums"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        <span className="self-center text-xs uppercase tracking-term text-accent">$ new</span>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="name"
          className="input flex-1 uppercase tracking-term"
        />
        <input
          type="number"
          value={newMonthly}
          onChange={(e) => setNewMonthly(e.target.value)}
          placeholder="monthly"
          className="input w-24 text-right tabular-nums"
        />
        <input
          type="number"
          value={newWeekly}
          onChange={(e) => setNewWeekly(e.target.value)}
          placeholder="weekly"
          className="input w-24 text-right tabular-nums"
        />
        <button className="btn btn-accent" onClick={addCategory} disabled={pending}>
          add
        </button>
      </div>
    </div>
  );
}
