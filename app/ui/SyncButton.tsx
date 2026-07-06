"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNow } from "../actions";

export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await syncNow();
      setMsg(
        r.ok
          ? r.newTransactions > 0
            ? `+${r.newTransactions} new`
            : "Up to date"
          : `Error: ${r.error ?? "failed"}`
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button className="btn btn-accent" onClick={run} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
