"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync/manual", { method: "POST" });
      const r = await res.json();
      setMsg(
        r.ok
          ? r.newTransactions > 0
            ? `+${r.newTransactions} new`
            : "Up to date"
          : `Error: ${r.error ?? "failed"}`
      );
      router.refresh();
    } catch {
      setMsg("Network error");
    } finally {
      setPending(false);
    }
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
