"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared line-colouring for every terminal console in the app (sync log, budget
 * recalibration, behavior analysis). Matches the `[TAG]` grammar used across the
 * server log streams.
 */
export function lineColor(l: string): string {
  const t = l.trimStart();
  if (t.startsWith("[FAIL]")) return "text-danger";
  if (t.startsWith("[!]")) return "text-danger";
  if (t.startsWith("[WARN]") || t.startsWith("[~]")) return "text-amber";
  if (t.startsWith("[DONE]")) return "text-accent";
  if (t.startsWith("[OK]") || t.startsWith("[✓]") || t.startsWith("[SET]")) return "text-ok";
  if (t.startsWith("[NEW]")) return "text-accent2";
  if (t.startsWith("[SKIP]")) return "text-faint";
  if (t.startsWith("[AI]")) return "text-accent2";
  if (t.startsWith("[SYNC]")) return "text-muted";
  if (t.startsWith("[DIAG]") || t.startsWith("(")) return "text-amber/60";
  if (l.startsWith("       ")) return "text-faint";
  return "text-muted";
}

interface AiConsoleProps {
  endpoint: string;
  method?: "GET" | "POST";
  body?: unknown;
  label: string;         // button label, e.g. "$ ai recalibrate"
  pendingLabel?: string; // label while streaming
  /** Refresh server components once the stream ends (default true). */
  refreshOnDone?: boolean;
  className?: string;
}

/**
 * Generic streaming console. POSTs (or GETs) an endpoint that returns a
 * newline-delimited text stream, renders each line live with terminal colours,
 * and auto-scrolls. Reused by budget recalibration and behavior analysis.
 */
export function AiConsole({
  endpoint,
  method = "POST",
  body,
  label,
  pendingLabel = "working…",
  refreshOnDone = true,
  className = "",
}: AiConsoleProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [log]);

  const run = useCallback(async () => {
    setPending(true);
    setLog([]);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body != null ? { "Content-Type": "application/json" } : undefined,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      if (!res.body) {
        setLog(["[FAIL] no response stream"]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        if (parts.length) setLog((l) => [...l, ...parts]);
      }
      if (buf.trim()) setLog((l) => [...l, buf]);
      if (refreshOnDone) router.refresh();
    } catch {
      setLog((l) => [...l, "[FAIL] network error — check your connection"]);
    } finally {
      setPending(false);
    }
  }, [endpoint, method, body, refreshOnDone, router]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button className="btn btn-accent self-start" onClick={run} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>

      {log.length > 0 && (
        <pre
          ref={preRef}
          className="max-h-72 overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.7rem] leading-relaxed"
        >
          {log.map((l, i) => (
            <div key={i} className={lineColor(l)}>
              {l}
              {pending && i === log.length - 1 && <span className="caret" />}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
