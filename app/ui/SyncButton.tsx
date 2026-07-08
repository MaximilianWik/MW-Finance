"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTypewriter, TerminalLog } from "./typewriter";

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
 * The sync endpoint streams its log line-by-line; the typewriter buffer types
 * it out live as each transaction is categorized.
 *
 * Re-linking before every sync is intentional: the ASPSP consent from
 * Lansforsakringar expires frequently and sync never succeeds without it.
 */
export function SyncButton() {
  const router = useRouter();
  const tw = useTypewriter();

  async function run() {
    tw.reset();
    tw.push("[SYNC] connecting to Enable Banking...\n");
    let ok = true;
    try {
      const res = await fetch("/api/sync/manual", { method: "POST" });
      if (!res.body) {
        tw.push("[FAIL] no response stream\n");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        buf += text;
        if (buf.includes("[FAIL]")) ok = false;
        tw.push(text);
      }
      if (ok) router.refresh();
    } catch {
      tw.push("\n[FAIL] network error \u2014 check your connection");
    } finally {
      tw.endStream();
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

  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-accent self-start"
        onClick={handleClick}
        disabled={tw.busy}
      >
        {tw.busy ? "syncing\u2026" : "$ sync now"}
      </button>

      {(tw.busy || tw.shown.length > 0) && (
        <TerminalLog shown={tw.shown} busy={tw.busy} typing={tw.typing} />
      )}
    </div>
  );
}
