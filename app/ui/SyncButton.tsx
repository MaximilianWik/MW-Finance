"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  ok: boolean;
  newTransactions?: number;
  accountsSynced?: number;
  error?: string;
  log?: string[];
}

/**
 * Sync console. Sends a POST to /api/sync/manual and renders the server-side
 * log lines returned by runSync — real step-by-step output including consent
 * validity, per-account fetch status, categorization, and behavior pipeline.
 */
export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const t0 = { current: 0 };

  async function run() {
    setPending(true);
    setLog(["[SYNC] connecting to Enable Banking..."]);
    t0.current = performance.now();
    try {
      const res = await fetch("/api/sync/manual", { method: "POST" });
      const r = (await res.json()) as SyncResult;
      const secs = ((performance.now() - t0.current) / 1000).toFixed(1);

      if (r.log && r.log.length > 0) {
        // Server returned structured log — use it verbatim.
        setLog(r.log);
      } else {
        // Fallback for old API response without log.
        setLog([
          r.ok
            ? `[DONE] sync complete — ${r.newTransactions ?? 0} new — ${secs}s`
            : `[FAIL] ${r.error ?? "unknown error"}`,
        ]);
      }

      if (r.ok) router.refresh();
    } catch {
      setLog((l) => [...l, "[FAIL] network error — check your connection"]);
    } finally {
      setPending(false);
    }
  }

  function lineColor(l: string): string {
    if (l.startsWith("[FAIL]")) return "text-danger";
    if (l.startsWith("[WARN]")) return "text-amber";
    if (l.startsWith("[DONE]")) return "text-accent";
    if (l.startsWith("[OK]"))   return "text-ok";
    if (l.startsWith("[AI]"))   return "text-accent2";
    if (l.startsWith("[DIAG]") || l.startsWith("  (")) return "text-amber/70";
    return "text-muted";
  }

  const consentExpired = log.some((l) => l.includes("consent expired"));

  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-accent self-start"
        onClick={run}
        disabled={pending}
      >
        {pending ? "syncing…" : "$ sync now"}
      </button>
      {log.length > 0 && (
        <>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed">
            {log.map((l, i) => (
              <div key={i} className={lineColor(l)}>
                {l}
                {pending && i === log.length - 1 && (
                  <span className="caret" />
                )}
              </div>
            ))}
          </pre>
          {consentExpired && (
            <a
              href="/api/auth/start"
              className="btn btn-accent self-start"
            >
              $ re-link bank → re-authorise now
            </a>
          )}
        </>
      )}
    </div>
  );
}
