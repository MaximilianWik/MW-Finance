"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** "$ new" row under the MONTHLY BUDGET table: name, colour, optional monthly limit. */
export function NewCategoryForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6f926f");
  const [monthly, setMonthly] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, budgetMonthly: monthly || null }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "add failed" }));
      setError(msg ?? "add failed");
      return;
    }
    setName("");
    setColor("#6f926f");
    setMonthly("");
    start(() => router.refresh());
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
      <span className="self-center text-xs uppercase tracking-term text-accent">$ new</span>
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        title="Colour"
        className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="category name"
        className="input flex-1 uppercase tracking-term"
      />
      <input
        type="number"
        inputMode="numeric"
        value={monthly}
        onChange={(e) => setMonthly(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="monthly"
        className="input w-24 text-right tabular-nums"
      />
      <button className="btn btn-accent" onClick={add} disabled={pending || !name.trim()}>
        add
      </button>
      {error && <span className="w-full text-[0.65rem] text-danger">[FAIL] {error}</span>}
    </div>
  );
}
