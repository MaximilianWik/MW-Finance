"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AiInsightRow {
  id: number;
  kind: string;     // pattern | suggestion | anomaly | trend
  severity: string; // info | warn | danger
  title: string;
  body: string;
}

function severityClasses(sev: string): { border: string; text: string } {
  if (sev === "danger") return { border: "border-danger/40", text: "text-danger" };
  if (sev === "warn") return { border: "border-amber/40", text: "text-amber" };
  return { border: "border-edge", text: "text-accent2" };
}

const KIND_TAG: Record<string, string> = {
  pattern: "PATTERN",
  suggestion: "SUGGEST",
  anomaly: "ANOMALY",
  trend: "TREND",
};

/**
 * Renders AI insights as severity-coloured terminal cards, each dismissable.
 * Dismiss removes it locally and soft-dismisses server-side.
 */
export function AiInsights({ initial }: { initial: AiInsightRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);

  async function dismiss(id: number) {
    setRows((r) => r.filter((x) => x.id !== id));
    await fetch("/api/insights/ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <p className="py-3 text-center text-sm text-muted">
        No AI insights yet. Run analysis to generate them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const c = severityClasses(r.severity);
        return (
          <div key={r.id} className={`flex items-start gap-2 border ${c.border} bg-panel2 px-3 py-2`}>
            <span className={`mt-0.5 shrink-0 text-[0.6rem] uppercase tracking-term ${c.text}`}>
              [{KIND_TAG[r.kind] ?? r.kind.toUpperCase()}]
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[0.75rem] uppercase tracking-term ${c.text}`}>{r.title}</div>
              <div className="mt-0.5 whitespace-pre-wrap text-[0.72rem] leading-relaxed text-muted">
                {r.body}
              </div>
            </div>
            <button
              onClick={() => dismiss(r.id)}
              title="Dismiss"
              className="shrink-0 text-faint hover:text-danger"
            >
              [x]
            </button>
          </div>
        );
      })}
    </div>
  );
}
