"use client";

import { useRouter } from "next/navigation";
import type { Cycle } from "@/lib/period";

/**
 * Salary-cycle selector for the budgets page. Renders a dropdown of all
 * detected salary cycles (newest first); selecting one pushes `?cycle=<from>`
 * so the server component re-queries that period's spending data.
 */
export function BudgetCycleNav({
  cycles,
  currentFrom,
}: {
  cycles: Cycle[];
  /** The `from` date of the currently-displayed cycle. */
  currentFrom: string;
}) {
  const router = useRouter();

  if (cycles.length <= 1) return null; // not enough history to navigate

  return (
    <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-term text-muted">
      <span className="text-faint">cycle</span>
      <select
        value={currentFrom}
        onChange={(e) => {
          const from = e.target.value;
          const isCurrent = from === cycles[0].from;
          router.push(isCurrent ? "/budgets" : `/budgets?cycle=${from}`);
        }}
        className="input cursor-pointer text-[0.7rem] uppercase tracking-term"
      >
        {cycles.map((c, i) => (
          <option key={c.from} value={c.from}>
            {c.label}
            {i === 0 ? "  (current)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
