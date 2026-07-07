"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

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
      <button onClick={() => setOpen(true)} className="btn btn-accent w-full">
        + Add goal
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3">
      <input
        required
        placeholder="Goal name (e.g. Tattoo)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="input"
      />
      <input
        required
        type="number"
        min="0"
        step="1"
        placeholder="Target (kr)"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="input"
      />
      <input
        type="date"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
        className="input"
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
        />
        Primary goal (receives auto-sweep)
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-accent flex-1">
          {busy ? "Saving…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
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
    <a
      href={`/goals/${id}`}
      className="card flex gap-4 transition hover:border-accent/40"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-panel2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-muted">
            ◇
          </div>
        )}
        {isPrimary && (
          <span className="absolute left-1 top-1 rounded bg-accent/80 px-1 text-[10px] font-medium uppercase text-black">
            Primary
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-baseline justify-between">
          <h3 className="truncate font-medium">
            {name}
            {paused && <span className="ml-2 text-xs text-muted">(paused)</span>}
          </h3>
          <span className="text-xs text-muted">
            {Math.round(progressPct * 100)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.max(progressPct * 100, 2)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted">
          <span className="tabular-nums">
            {kr(current)} / {kr(target)}
          </span>
          <span>
            {velocity > 0
              ? `${kr(velocity)}/mo · ${
                  monthsToGoal != null && monthsToGoal < 240
                    ? Math.ceil(monthsToGoal) + " months"
                    : "—"
                }`
              : "no velocity yet"}
          </span>
        </div>
      </div>
    </a>
  );
}
