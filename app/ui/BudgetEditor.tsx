"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

export interface EditableCategory {
  id: number;
  name: string;
  color: string;
  budgetMonthly: string | null;
  spent: number;
}

// Mirror of the server-side guard — core categories can't be deleted.
const UNDELETABLE = new Set(["Uncategorized", "Income", "Transfers", "Savings"]);

export function BudgetEditor({ categories }: { categories: EditableCategory[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(categories);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6f926f");
  const [newMonthly, setNewMonthly] = useState("");

  async function save(id: number, value: string) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, budgetMonthly: value === "" ? null : value }),
    });
    start(() => router.refresh());
  }

  async function saveColor(id: number, color: string) {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, color } : c)));
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, color }),
    });
    start(() => router.refresh());
  }

  async function del(id: number, name: string) {
    if (!confirm(`Delete "${name}"? Transactions in it become uncategorized (history is kept).`)) return;
    const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((r) => r.filter((c) => c.id !== id));
      start(() => router.refresh());
    } else {
      const { error } = await res.json().catch(() => ({ error: "delete failed" }));
      alert(error ?? "delete failed");
    }
  }

  async function addCategory() {
    if (!newName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        color: newColor,
        budgetMonthly: newMonthly || null,
      }),
    });
    if (res.ok) {
      const { category } = await res.json();
      setRows((r) => [...r, { ...category, spent: 0 }]);
      setNewName("");
      setNewColor("#6f926f");
      setNewMonthly("");
      start(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="term-table">
          <thead>
            <tr>
              <th>CATEGORY</th>
              <th className="text-right">SPENT (MO)</th>
              <th className="text-right">MONTHLY</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="uppercase tracking-term">
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => saveColor(c.id, e.target.value)}
                      title="Category colour"
                      className="h-4 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                    />
                    {c.name}
                  </span>
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
                        save(c.id, e.target.value);
                      }
                    }}
                    className="input w-24 text-right tabular-nums"
                  />
                </td>
                <td className="text-right">
                  {!UNDELETABLE.has(c.name) && (
                    <button
                      onClick={() => del(c.id, c.name)}
                      disabled={pending}
                      title={`Delete ${c.name}`}
                      className="btn btn-danger !px-1.5 !py-0.5 text-[0.65rem]"
                    >
                      del
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        <span className="self-center text-xs uppercase tracking-term text-accent">$ new</span>
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          title="Colour"
          className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
        />
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
        <button className="btn btn-accent" onClick={addCategory} disabled={pending}>
          add
        </button>
      </div>
    </div>
  );
}
