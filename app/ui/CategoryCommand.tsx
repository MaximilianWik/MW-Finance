"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface CatOption {
  id: number;
  name: string;
  color: string;
}

/**
 * Command-style category override. Renders the current category as a token;
 * clicking turns it into a `>` prompt. Type to filter, ↑/↓ to move, Enter to
 * apply, Esc to cancel. No dropdown chrome — pure terminal.
 */
export function CategoryCommand({
  txId,
  categoryId,
  options,
}: {
  txId: number;
  categoryId: number | null;
  options: CatOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(categoryId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.id === value);
  const matches = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function apply(id: number) {
    setValue(id);
    setOpen(false);
    setQuery("");
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, categoryId: id }),
    });
    if (res.ok) start(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={pending}
        className="group inline-flex items-center gap-1 text-xs uppercase tracking-term hover:text-accent"
        style={{ color: current?.color ?? "#72728a" }}
        aria-label="Override category"
      >
        <span className="text-faint group-hover:text-accent">»</span>
        {current?.name ?? "uncategorized"}
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="prompt !py-0.5">
        <span className="sigil text-xs">{">"}</span>
        <input
          ref={inputRef}
          value={query}
          placeholder="category…"
          onChange={(e) => {
            setQuery(e.target.value);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (matches[hi]) apply(matches[hi].id);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="!w-32 text-xs uppercase tracking-term"
        />
      </div>
      {matches.length > 0 && (
        <ul className="absolute left-0 top-full z-30 mt-0.5 max-h-48 w-44 overflow-auto border border-edge bg-panel">
          {matches.map((o, i) => (
            <li key={o.id}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(o.id);
                }}
                onMouseEnter={() => setHi(i)}
                className={
                  "flex w-full items-center gap-1 px-2 py-1 text-left text-xs uppercase tracking-term " +
                  (i === hi ? "bg-accent/15 text-accent" : "text-ink2 hover:bg-panel2")
                }
              >
                <span style={{ color: o.color }}>■</span>
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
