"use client";

import { useRouter } from "next/navigation";
import { useTypewriter, TerminalLog } from "./typewriter";

// Backwards-compat re-export (older imports pulled lineColor from here).
export { lineColor } from "./typewriter";

interface AiConsoleProps {
  endpoint: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** Computed at click time — use for inputs whose value changes (overrides body). */
  getBody?: () => unknown;
  label: string;         // button label, e.g. "$ ai recalibrate"
  pendingLabel?: string; // label while streaming
  /** Refresh server components once the stream ends (default true). */
  refreshOnDone?: boolean;
  className?: string;
}

/**
 * Generic streaming console. POSTs (or GETs) an endpoint that returns a
 * newline-delimited text stream and types the output live via the typewriter
 * buffer. Reused by budget recalibration, behavior analysis, and ledger
 * categorization.
 */
export function AiConsole({
  endpoint,
  method = "POST",
  body,
  getBody,
  label,
  pendingLabel = "working…",
  refreshOnDone = true,
  className = "",
}: AiConsoleProps) {
  const router = useRouter();
  const tw = useTypewriter();

  async function run() {
    tw.reset();
    const payload = getBody ? getBody() : body;
    try {
      const res = await fetch(endpoint, {
        method,
        headers: payload != null ? { "Content-Type": "application/json" } : undefined,
        body: payload != null ? JSON.stringify(payload) : undefined,
      });
      if (!res.body) {
        tw.push("[FAIL] no response stream\n");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tw.push(decoder.decode(value, { stream: true }));
      }
      if (refreshOnDone) router.refresh();
    } catch {
      tw.push("\n[FAIL] network error — check your connection");
    } finally {
      tw.endStream();
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button className="btn btn-accent self-start" onClick={run} disabled={tw.busy}>
        {tw.busy ? pendingLabel : label}
      </button>

      {(tw.busy || tw.shown.length > 0) && (
        <TerminalLog shown={tw.shown} busy={tw.busy} typing={tw.typing} />
      )}
    </div>
  );
}
