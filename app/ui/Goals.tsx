"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import { AsciiBar } from "./AsciiBar";

export function NewGoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        targetAmount: Number(target),
        targetDate: targetDate || null,
        isPrimary,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "failed");
      return;
    }
    setName("");
    setTarget("");
    setTargetDate("");
    setIsPrimary(false);
    setOpen(false);
    start(() => router.refresh());
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-accent self-start">
        $ new goal
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border border-edge bg-panel2 p-3">
      <input
        required
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="input uppercase tracking-term"
      />
      <div className="flex gap-2">
        <input
          required
          type="number"
          min="0"
          placeholder="target kr"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="input flex-1 tabular-nums"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="input flex-1"
        />
      </div>
      <label className="flex items-center gap-2 text-xs uppercase tracking-term text-muted">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="accent-[#4ee06a]"
        />
        primary — receives auto-sweep
      </label>
      {error && <p className="text-sm text-danger">[ FAIL ] {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-accent flex-1">
          {busy ? "…" : "create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          cancel
        </button>
      </div>
    </form>
  );
}

export function GoalRow(props: {
  id: number;
  name: string;
  imageUrl: string | null;
  current: number;
  target: number;
  progressPct: number;
  velocity: number;
  monthsToGoal: number | null;
  isPrimary: boolean;
  paused: boolean;
}) {
  const { id, name, imageUrl, current, target, progressPct, velocity, monthsToGoal, isPrimary, paused } = props;
  return (
    <a href={`/goals/${id}`} className="panel block transition-colors hover:border-edge2">
      <span className="panel-title">[ GOAL: {name.toUpperCase()} ]</span>
      {isPrimary && (
        <span className="absolute -top-[0.62rem] right-3 bg-ink px-2 text-[0.7rem] uppercase tracking-term text-accent">
          PRIMARY
        </span>
      )}
      <div className="flex gap-4">
        <div className="h-20 w-20 shrink-0 border border-edge bg-panel2">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-edge2">
              ◈
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <AsciiBar ratio={progressPct} width={20} tone="accent2" />
          <div className="flex justify-between text-xs text-muted">
            <span className="tabular-nums">
              {kr(current)} / {kr(target)}
            </span>
            <span>
              {paused
                ? "[ PAUSED ]"
                : velocity > 0
                ? `${kr(velocity)}/mo · ${
                    monthsToGoal != null && monthsToGoal < 240 ? Math.ceil(monthsToGoal) + "mo" : "—"
                  }`
                : "no velocity"}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
