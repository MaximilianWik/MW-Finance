"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

/** Set the goal's pace by hand (kr per cycle), or go back to the computed one. */
export function PaceEditor({
  goalId,
  manual,
  autoPace,
}: {
  goalId: number;
  manual: number | null;
  autoPace: number;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [value, setValue] = useState(manual != null ? String(manual) : "");
  const [msg, setMsg] = useState<string | null>(null);

  async function save(monthlyPace: number | null) {
    setMsg(null);
    const res = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goalId, monthlyPace }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setMsg(`[FAIL] ${error}`);
      return;
    }
    if (monthlyPace === null) setValue("");
    start(() => router.refresh());
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(value.trim() === "" ? null : Number(value));
      }}
      className="flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-term text-faint"
    >
      <span>pace per cycle</span>
      <input
        type="number"
        min={0}
        step={50}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`auto ${autoPace}`}
        className="input w-28 !px-1.5 !py-0.5 text-right normal-case"
        aria-label="Pace per cycle"
      />
      <span>kr</span>
      <button type="submit" className="btn btn-accent !py-0.5 text-[0.65rem]">
        set
      </button>
      {manual != null && (
        <button type="button" onClick={() => save(null)} className="hover:text-accent">
          use auto ({kr(autoPace)})
        </button>
      )}
      <span className="normal-case tracking-normal">
        {manual != null ? "manual: what you plan to put in each cycle" : "auto: median net deposits, last 6 cycles"}
      </span>
      {msg && <span className="text-danger">{msg}</span>}
    </form>
  );
}
