"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  ok: boolean;
  newTransactions?: number;
  accountsSynced?: number;
  error?: string;
}

/**
 * "Sync now" trigger rendered as a terminal console. Streams a stepped log
 * (connect → poll → categorize → done) while the request runs, then prints
 * the real result. Not a live server stream — the steps are client-side
 * scaffolding around a single POST — but it reads as the console the design
 * philosophy calls for. The full live AI log lands in Phase 3.
 */
export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function push(line: string) {
    setLog((l) => [...l, line]);
  }

  async function run() {
    setPending(true);
    setLog([]);
    push("[SYNC] connecting to Enable Banking...");
    const t0 = performance.now();
    try {
      push("[SYNC] polling linked accounts...");
      const res = await fetch("/api/sync/manual", { method: "POST" });
      const r = (await res.json()) as SyncResult;
      const secs = ((performance.now() - t0) / 1000).toFixed(1);

      if (!r.ok) {
        push(`[FAIL] ${r.error ?? "sync failed"}`);
      } else {
        push(`[SYNC] ${r.accountsSynced ?? 0} account(s) polled            [ OK ]`);
        if ((r.newTransactions ?? 0) > 0) {
          push(`[AI]   categorizing ${r.newTransactions} new txn(s)...`);
          push(`[DONE] sync complete — +${r.newTransactions} new — ${secs}s`);
        } else {
          push(`[DONE] up to date — no new transactions — ${secs}s`);
        }
      }
      router.refresh();
    } catch {
      push("[FAIL] network error");
    } finally {
      setPending(false);
    }
  }

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
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed text-ink2">
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.startsWith("[FAIL]")
                  ? "text-danger"
                  : l.startsWith("[DONE]")
                  ? "text-accent"
                  : l.includes("[ OK ]")
                  ? "text-ok"
                  : "text-muted"
              }
            >
              {l}
              {pending && i === log.length - 1 ? <span className="caret" /> : null}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
