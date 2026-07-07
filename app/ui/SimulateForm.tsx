"use client";

import { useState } from "react";
import type { SimulateResult } from "@/lib/simulate";
import { kr, krSigned } from "@/lib/format";

interface CatOption {
  id: number;
  name: string;
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
      const data = (await res.json()) as SimulateResult & { reason?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.reason ?? data.error ?? "failed");
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
    ? result.rows.filter(
        (r) => Math.abs(r.simulatedDelta) > 0.5 || r.categoryId === result.input.categoryId
      )
    : [];
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="prompt !py-1 flex-1">
          <span className="sigil text-xs">$ spend</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="amount kr"
            className="tabular-nums"
          />
        </label>
        <label className="prompt !py-1">
          <span className="sigil text-xs">on</span>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="bg-transparent text-sm uppercase tracking-term text-ink2 outline-none"
          >
            <option value="" className="bg-panel">
              category…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-panel">
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading} className="btn btn-accent">
          {loading ? "…" : "simulate"}
        </button>
      </form>
      {error && <p className="text-sm text-danger">[ FAIL ] {error}</p>}

      {result && (
        <pre className="overflow-x-auto border border-edge bg-ink p-3 text-[0.8rem] leading-relaxed">
          <div className="text-faint">
            @@ hypothetical: {krSigned(-result.input.amount)} on {catName(result.input.categoryId)} · {result.month} @@
          </div>
          {changed.map((r) => {
            if (Math.abs(r.effectiveAfter - r.effectiveBefore) < 0.5) {
              // unchanged budget line (the target itself if no redistribution)
              return (
                <div key={r.categoryId} className="text-muted">
                  {"  "}
                  {r.name.toLowerCase()}: {kr(r.effectiveBefore)}
                </div>
              );
            }
            return (
              <div key={r.categoryId}>
                <div className="text-danger">
                  - {r.name.toLowerCase()}: {kr(r.effectiveBefore)}
                </div>
                <div className="text-ok">
                  + {r.name.toLowerCase()}: {kr(r.effectiveAfter)}{" "}
                  <span className="text-faint">({krSigned(r.simulatedDelta)})</span>
                </div>
              </div>
            );
          })}
          <div className="mt-2 border-t border-edge pt-2 text-faint">
            savings sweep: {kr(result.sweepBefore)} →{" "}
            <span className={result.sweepDelta >= 0 ? "text-ok" : "text-danger"}>
              {kr(result.sweepAfter)} ({krSigned(result.sweepDelta)})
            </span>
          </div>
        </pre>
      )}
    </div>
  );
}
