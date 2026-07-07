"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { CatOption } from "./CategoryCommand";

export function TxFilters({ options }: { options: CatOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/transactions?${params.toString()}`);
  }

  const month      = sp.get("month") ?? "";
  const categoryId = sp.get("categoryId") ?? "";
  const q          = sp.get("q") ?? "";
  const minAmount  = sp.get("minAmount") ?? "";
  const maxAmount  = sp.get("maxAmount") ?? "";
  const hasFilters = month || categoryId || q || minAmount || maxAmount;

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs uppercase tracking-term text-muted">
      <span className="self-center text-accent">$ filter</span>

      <label className="prompt !py-1">
        <span className="sigil text-xs">--month</span>
        <input
          type="month"
          value={month}
          onChange={(e) => update({ month: e.target.value })}
          className="!w-36 text-xs uppercase tracking-term"
          aria-label="Month"
        />
      </label>

      <label className="prompt !py-1">
        <span className="sigil text-xs">--cat</span>
        <select
          value={categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
          className="text-xs uppercase tracking-term"
          aria-label="Category"
        >
          <option value="">all</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>

      <label className="prompt !py-1 flex-1 min-w-[10rem]">
        <span className="sigil text-xs">--search</span>
        <input
          type="text"
          value={q}
          placeholder="name / merchant…"
          onChange={(e) => update({ q: e.target.value })}
          className="!w-full text-xs"
          aria-label="Text search"
        />
      </label>

      <label className="prompt !py-1 w-28">
        <span className="sigil text-xs">≥</span>
        <input
          type="number"
          min="0"
          value={minAmount}
          placeholder="min kr"
          onChange={(e) => update({ minAmount: e.target.value })}
          className="!w-full tabular-nums text-xs"
          aria-label="Min amount"
        />
      </label>

      <label className="prompt !py-1 w-28">
        <span className="sigil text-xs">≤</span>
        <input
          type="number"
          min="0"
          value={maxAmount}
          placeholder="max kr"
          onChange={(e) => update({ maxAmount: e.target.value })}
          className="!w-full tabular-nums text-xs"
          aria-label="Max amount"
        />
      </label>

      {hasFilters && (
        <button
          onClick={() => router.push("/transactions")}
          className="btn btn-danger !py-1 text-[0.65rem]"
        >
          [ clear ]
        </button>
      )}
    </div>
  );
}
