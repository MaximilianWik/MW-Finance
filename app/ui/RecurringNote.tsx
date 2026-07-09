"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline notes editor for a recurring payment row. Click to open, Enter or
 * blur to save, Escape to cancel.
 */
export function RecurringNote({ id, initial }: { id: number; initial: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [busy, start] = useTransition();

  async function save() {
    setEditing(false);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: value.trim() || null }),
    });
    start(() => router.refresh());
  }

  function cancel() {
    setValue(initial ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        className="input !py-0.5 w-full text-xs"
        placeholder="alias / notes…"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={busy}
      title="Click to edit"
      className="text-left text-[0.72rem] text-muted italic hover:text-ink2"
    >
      {value.trim() || <span className="text-faint not-italic">+ add note</span>}
    </button>
  );
}
