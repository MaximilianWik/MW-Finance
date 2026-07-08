"use client";

import { useEffect, useRef, useState } from "react";
import { useTypewriter, Spinner } from "./typewriter";

interface Turn {
  role: "user" | "model";
  text: string;
}

const SUGGESTIONS = [
  "how am I doing this cycle?",
  "where can I cut spending?",
  "how long until my goal?",
  "what are my biggest recurring bills?",
];

/**
 * Conversational assistant console. Full CLI look — `>` prompt input, user
 * lines echoed in accent, `[AI]` responses typed out live via the typewriter
 * buffer. History is kept in-session and sent with each question for continuity.
 */
export function AssistantConsole() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const tw = useTypewriter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, pendingQ, tw.shown, tw.busy]);

  // Once the typewriter has fully drained, commit the answer into history.
  useEffect(() => {
    if (pendingQ !== null && !tw.busy && commitRef.current !== null) {
      const q = commitRef.current;
      const answer = tw.shown;
      commitRef.current = null;
      setHistory((h) => [...h, { role: "user", text: q }, { role: "model", text: answer }]);
      setPendingQ(null);
      inputRef.current?.focus();
    }
  }, [tw.busy, tw.shown, pendingQ]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pendingQ !== null) return;
    setInput("");
    setPendingQ(q);
    commitRef.current = q;
    const priorHistory = history;
    tw.reset();
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: priorHistory }),
      });
      if (!res.body) {
        tw.push("[FAIL] no response stream");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tw.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      tw.push("\n[FAIL] network error — check your connection");
    } finally {
      tw.endStream();
    }
  }

  const showConsole = history.length > 0 || pendingQ !== null;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="max-h-[28rem] min-h-[12rem] overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.75rem] leading-relaxed"
      >
        {!showConsole ? (
          <div className="text-faint">
            <div>MWFINANCE assistant ready. Ask about your budget, spending, goals or bills.</div>
            <div className="mt-3 flex flex-col gap-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-left text-accent2 hover:underline">
                  &gt; {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {history.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="mt-2 text-accent">
                  &gt; {t.text}
                </div>
              ) : (
                <div key={i} className="text-ink2">
                  <span className="text-accent2">[AI]</span> {t.text}
                </div>
              )
            )}
            {pendingQ !== null && (
              <>
                <div className="mt-2 text-accent">&gt; {pendingQ}</div>
                <div className="text-ink2">
                  <span className="text-accent2">[AI]</span> {tw.shown}
                  {tw.typing && <span className="caret" />}
                  {tw.busy && !tw.typing && <Spinner />}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border border-edge bg-ink px-2 py-1.5">
        <span className="text-accent">&gt;</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-[0.75rem] text-ink2 outline-none placeholder:text-faint"
          placeholder={pendingQ !== null ? "waiting for response…" : "type a question and press enter"}
          value={input}
          disabled={pendingQ !== null}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(input);
          }}
        />
      </div>
    </div>
  );
}
