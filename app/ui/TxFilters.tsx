"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { CatOption } from "./CategoryCommand";

export function TxFilters({ options }: { options: CatOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const month = sp.get("month") ?? "";
  const categoryId = sp.get("categoryId") ?? "";

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/transactions?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-term text-muted">
      <span className="text-accent">$ filter</span>
      <label className="prompt !py-1">
        <span className="sigil text-xs">--month</span>
        <input
          type="month"
          value={month}
          onChange={(e) => update({ month: e.target.value })}
          className="!w-36 bg-transparent text-xs uppercase tracking-term text-ink2 caret-accent outline-none"
          aria-label="Month"
        />
      </label>
      <label className="prompt !py-1">
        <span className="sigil text-xs">--cat</span>
        <select
          value={categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
          className="bg-transparent text-xs uppercase tracking-term text-ink2 outline-none"
          aria-label="Category filter"
        >
          <option value="" className="bg-panel">
            all
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id} className="bg-panel">
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {(month || categoryId) && (
        <button
          onClick={() => router.push("/transactions")}
          className="text-faint hover:text-danger"
        >
          [ clear ]
        </button>
      )}
    </div>
  );
}
