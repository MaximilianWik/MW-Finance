"use client";

import { useState } from "react";
import type { SimulateResult } from "@/lib/simulate";
import { kr, krSigned } from "@/lib/format";

interface CatOption {
  id: number;
  name: string;
  emoji: string;
}

export function SimulateForm({ categories }: { categories: CatOption[] }) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || !categoryId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), categoryId }),
      });
      const data = (await res.json()) as SimulateResult;
      if (!res.ok || !data.ok) {
        setError((data as { reason?: string; error?: string }).reason ?? (data as { error?: string }).error ?? "failed");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const changed = result
    ? result.rows.filter((r) => Math.abs(r.simulatedDelta) > 0.5 || r.categoryId === result.input.categoryId)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Amount (kr)
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            placeholder="e.g. 1500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Category
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="input"
          >
            <option value="">— pick a category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading} className="btn btn-accent">
          {loading ? "Simulating…" : "Simulate"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      {result && (
        <section className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Impact · {result.month}</h2>
            <span className="text-xs text-muted">{result.rows.length} categories</span>
          </div>

          <div className="mt-3 rounded-lg bg-panel2 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Projected sweep before</span>
              <span className="tabular-nums">{kr(result.sweepBefore)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Projected sweep after</span>
              <span className="tabular-nums">{kr(result.sweepAfter)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-edge pt-1">
              <span className="text-muted">Change to savings</span>
              <span
                className={
                  "tabular-nums " +
                  (result.sweepDelta >= 0 ? "text-emerald-400" : "text-danger")
                }
              >
                {krSigned(result.sweepDelta)}
              </span>
            </div>
          </div>

          {changed.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">
                Redistribution
              </h3>
              <ul className="divide-y divide-edge/40">
                {changed.map((r) => {
                  const isTarget = r.categoryId === result.input.categoryId;
                  const dcolor =
                    r.simulatedDelta === 0
                      ? "text-muted"
                      : r.simulatedDelta > 0
                      ? "text-emerald-400"
                      : "text-amber-400";
                  return (
                    <li
                      key={r.categoryId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span>{r.emoji}</span>
                        <span className={isTarget ? "text-white" : "text-muted"}>
                          {r.name}
                        </span>
                        {isTarget && (
                          <span className="rounded bg-accent/20 px-1 text-[10px] uppercase text-accent">
                            target
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className="text-muted">{kr(r.effectiveBefore)}</span>
                        <span>→</span>
                        <span>{kr(r.effectiveAfter)}</span>
                        <span className={dcolor}>{krSigned(r.simulatedDelta)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
