"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Compact month prev/next navigator for the bills checklist. Updates
 * a `?billsMonth=YYYY-MM` search param so the server re-fetches.
 */
export function ChecklistMonthNav({
  currentMonth,
  label,
  isHistorical,
}: {
  currentMonth: string;
  label: string;
  isHistorical: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(ym: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("billsMonth", ym);
    router.push(`/insights?${params.toString()}`);
  }

  function shift(months: number) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + months, 1));
    go(d.toISOString().slice(0, 7));
  }

  const today = new Date().toISOString().slice(0, 7);
  const atCurrent = currentMonth >= today;

  return (
    <div className="flex items-center gap-1 text-xs uppercase tracking-term">
      <button onClick={() => shift(-1)} className="btn !px-2 !py-0.5">‹</button>
      <span className="w-24 text-center text-ink2">{label}</span>
      <button
        onClick={() => shift(1)}
        disabled={atCurrent}
        className="btn !px-2 !py-0.5 disabled:opacity-30"
      >
        ›
      </button>
      {isHistorical && (
        <button onClick={() => go(today)} className="btn !px-2 !py-0.5 text-accent">
          now
        </button>
      )}
    </div>
  );
}
