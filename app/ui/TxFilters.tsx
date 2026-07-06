"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { CatOption } from "./CategorySelect";

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
    <div className="flex items-center gap-2">
      <input
        type="month"
        value={month}
        onChange={(e) => update({ month: e.target.value })}
        className="input flex-1"
        aria-label="Month"
      />
      <select
        value={categoryId}
        onChange={(e) => update({ categoryId: e.target.value })}
        className="input flex-1"
        aria-label="Category filter"
      >
        <option value="">All categories</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.emoji} {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
