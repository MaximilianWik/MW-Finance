"use client";

import { useState } from "react";
import { krSigned, shortDate } from "@/lib/format";
import type { PendingReflection } from "@/lib/game/reflections";

type Verdict = "glad" | "regret" | "meh";

const BUTTONS: Array<{ verdict: Verdict; label: string; cls: string }> = [
  { verdict: "glad",   label: "[ GLAD ]",   cls: "btn-ok" },
  { verdict: "regret", label: "[ REGRET ]", cls: "btn-danger" },
  { verdict: "meh",    label: "[ MEH ]",    cls: "" },
];

/**
 * "Still glad you got this?" prompt for recent discretionary purchases.
 * Answering posts a verdict and drops the row from the list (optimistic).
 */
export function PendingReflections({ initial }: { initial: PendingReflection[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function answer(id: number, verdict: Verdict) {
    setBusy(id);
    try {
      await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id, verdict }),
      });
      setRows((r) => r.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <p className="py-2 text-sm text-muted">All caught up. Nothing to reflect on.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.7rem] uppercase tracking-term text-faint">
        Still glad you got these?
      </p>
      <ul className="flex flex-col divide-y divide-grid">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[0.7rem] text-muted">{shortDate(r.bookingDate)}</span>
                <span className="truncate text-ink2">{r.displayName}</span>
                <span className="shrink-0 text-danger">{krSigned(r.signed)}</span>
              </div>
              {r.categoryName && (
                <span
                  className="text-[0.62rem] uppercase tracking-term"
                  style={{ color: r.categoryColor ?? "#72728a" }}
                >
                  {r.categoryName}
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {BUTTONS.map((b) => (
                <button
                  key={b.verdict}
                  onClick={() => answer(r.id, b.verdict)}
                  disabled={busy === r.id}
                  className={`btn !px-2 !py-0.5 text-[0.65rem] ${b.cls}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
