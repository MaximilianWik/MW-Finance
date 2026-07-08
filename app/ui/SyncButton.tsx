"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  ok: boolean;
  newTransactions?: number;
  accountsSynced?: number;
  error?: string;
  log?: string[];
}

/**
 * Sync console.
 *
 * FLOW
 * 1. User clicks "$ sync now" -> page navigates to /api/auth/start?autoSync=1
 *    which stores an eb_auto_sync cookie and kicks off the BankID re-link.
 * 2. After BankID the Enable Banking callback redirects back to
 *    /?linked=X&autoSync=1.
 * 3. This component detects autoSync=1 on mount, strips it from the URL,
 *    and immediately starts the sync so the user sees the full log output
 *    without any extra clicks.
 *
 * Re-linking before every sync is intentional: the ASPSP consent from
 * Lansforsakringar expires frequently and sync never succeeds without it.
 */
export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [log, setLog]         = useState<string[]>([]);

  async function run() {
    setPending(true);
    setLog(["[SYNC] connecting to Enable Banking..."]);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/sync/manual", { method: "POST" });
      const r = (await res.json()) as SyncResult;
      const secs = ((performance.now() - t0) / 1000).toFixed(1);

      if (r.log && r.log.length > 0) {
        // Append a wall-clock summary that isn't part of the server log.
        setLog([...r.log, `[DONE] wall time ${secs}s`]);
      } else {
        setLog([
          r.ok
            ? `[DONE] sync complete \u2014 ${r.newTransactions ?? 0} new \u2014 ${secs}s`
            : `[FAIL] ${r.error ?? "unknown error"}`,
        ]);
      }

      if (r.ok) router.refresh();
    } catch {
      setLog((l) => [...l, "[FAIL] network error \u2014 check your connection"]);
    } finally {
      setPending(false);
    }
  }

  // After BankID re-link the callback returns with ?autoSync=1.
  // Detect it, strip from URL immediately, then auto-start the sync.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("autoSync") === "1") {
      // Clean the URL so a refresh doesn't re-trigger.
      const clean = window.location.pathname +
        window.location.search
          .replace(/[?&]autoSync=1/, "")
          .replace(/^\&/, "?")
          .replace(/\?$/, "");
      window.history.replaceState({}, "", clean);
      run();
    }
    // run is stable on first mount (no deps needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick() {
    // Always re-link before syncing. The BankID flow sets the eb_auto_sync
    // cookie; on return the autoSync=1 param triggers run() above.
    window.location.href = "/api/auth/start?autoSync=1";
  }

  function lineColor(l: string): string {
    if (l.startsWith("[FAIL]"))                   return "text-danger";
    if (l.startsWith("[WARN]"))                   return "text-amber";
    if (l.startsWith("[DONE]"))                   return "text-accent";
    if (l.startsWith("[OK]"))                     return "text-ok";
    if (l.startsWith("[AI]"))                     return "text-accent2";
    if (l.startsWith("[SYNC]"))                   return "text-muted";
    if (l.startsWith("[DIAG]") || l.startsWith("  (")) return "text-amber/60";
    if (l.startsWith("       "))                  return "text-faint";
    return "text-muted";
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-accent self-start"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "syncing\u2026" : "$ sync now"}
      </button>

      {log.length > 0 && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed">
          {log.map((l, i) => (
            <div key={i} className={lineColor(l)}>
              {l}
              {pending && i === log.length - 1 && (
                <span className="caret" />
              )}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}