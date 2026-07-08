"use client";

import { useEffect, useRef, useState } from "react";

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
 * lines echoed in accent, `[AI]` responses streamed in as monospace text.
 * History is kept in-session and sent with each question for continuity.
 */
export function AssistantConsole() {
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, pending]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setInput("");
    const priorHistory = history;
    setHistory((h) => [...h, { role: "user", text: q }, { role: "model", text: "" }]);
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: priorHistory }),
      });
      if (!res.body) {
        appendToLast("\n[FAIL] no response stream");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLast(decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToLast("\n[FAIL] network error — check your connection");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function appendToLast(text: string) {
    setHistory((h) => {
      const copy = [...h];
      const last = copy[copy.length - 1];
      if (last && last.role === "model") copy[copy.length - 1] = { role: "model", text: last.text + text };
      return copy;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="max-h-[28rem] min-h-[12rem] overflow-auto whitespace-pre-wrap border border-edge bg-ink px-3 py-2 text-[0.75rem] leading-relaxed"
      >
        {history.length === 0 ? (
          <div className="text-faint">
            <div>MWFINANCE assistant ready. Ask about your budget, spending, goals or bills.</div>
            <div className="mt-3 flex flex-col gap-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-left text-accent2 hover:underline"
                >
                  &gt; {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="mt-2 text-accent">
                &gt; {t.text}
              </div>
            ) : (
              <div key={i} className="text-ink2">
                <span className="text-accent2">[AI]</span> {t.text}
                {pending && i === history.length - 1 && <span className="caret" />}
              </div>
            )
          )
        )}
      </div>

      <div className="flex items-center gap-2 border border-edge bg-ink px-2 py-1.5">
        <span className="text-accent">&gt;</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-[0.75rem] text-ink2 outline-none placeholder:text-faint"
          placeholder={pending ? "waiting for response…" : "type a question and press enter"}
          value={input}
          disabled={pending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(input);
          }}
        />
      </div>
    </div>
  );
}
