"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface CatOpt {
  id: number;
  name: string;
  color: string;
}

/**
 * Inline category selector for a recurring payment row. Renders as a minimal
 * colored select; changing it PATCHes /api/recurring and refreshes the page.
 */
export function RecurringCategory({
  recurringId,
  categoryId,
  options,
}: {
  recurringId: number;
  categoryId: number | null;
  options: CatOpt[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(categoryId);
  const [busy, start] = useTransition();

  const current = options.find((o) => o.id === value);

  async function onChange(catId: number | null) {
    setValue(catId);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recurringId, categoryId: catId }),
    });
    start(() => router.refresh());
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      disabled={busy}
      className="bg-transparent text-[0.72rem] uppercase tracking-term outline-none disabled:opacity-50"
      style={{ color: current?.color ?? "#72728a" }}
    >
      <option value="" className="bg-panel text-faint">
        — none —
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id} className="bg-panel" style={{ color: o.color }}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
