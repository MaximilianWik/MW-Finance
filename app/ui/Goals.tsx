"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import { AsciiBar } from "./AsciiBar";
import type { GoalSummary } from "@/lib/savings";
import { fmtMonthYear } from "@/lib/goal-math";

interface AccountOption {
  id: number;
  name: string;
  color: string;
  currentBalance: number;
}

export function NewGoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open || accounts.length) return;
    fetch("/api/investments")
      .then((r) => r.json())
      .then((d: { accounts?: AccountOption[] }) => setAccounts(d.accounts ?? []))
      .catch(() => setAccounts([]));
  }, [open, accounts.length]);

  function toggle(id: number) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
        accounts: [...picked].map((accountId) => ({ accountId })),
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
    setPicked(new Set());
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
      {accounts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-term text-faint">
            funded by (full balance counts; change shares on the goal page)
          </span>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-xs uppercase tracking-term ${
                  picked.has(a.id) ? "border-accent/60 text-ink2" : "border-edge text-muted"
                }`}
              >
                <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} className="accent-accent" />
                <span style={{ color: a.color }}>{"\u25a0"}</span>
                {a.name}
                <span className="text-faint normal-case">{kr(a.currentBalance)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs uppercase tracking-term text-muted">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="accent-accent"
        />
        primary (shown on the overview)
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

/** Short tag for a goal's on-track state. */
export function TrackTag({ track, pace }: { track: GoalSummary["track"]; pace: number }) {
  const cls = "tag text-[0.6rem]";
  if (pace < 0 && track.state !== "done") return <span className={`${cls} tag-danger`}>[ NET OUTFLOW ]</span>;
  switch (track.state) {
    case "done":
      return <span className={`${cls} tag-ok`}>[ DONE ]</span>;
    case "on-track":
      return <span className={`${cls} tag-ok`}>[ ON TRACK ]</span>;
    case "behind":
      return <span className={`${cls} tag-danger`}>[ BEHIND +{kr(Math.ceil(track.gap ?? 0))}/MO ]</span>;
    case "no-pace":
      return <span className={`${cls} tag-muted`}>[ NO PACE ]</span>;
    default:
      return pace > 0 ? null : <span className={`${cls} tag-muted`}>[ NO PACE ]</span>;
  }
}

export function GoalRow(props: GoalSummary) {
  const { id, name, imageUrl, current, target, progressPct, velocity, netPace, etaDate, isPrimary, paused, track, accounts } = props;
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
            <div className="flex h-full w-full items-center justify-center text-2xl text-edge2">◈</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <AsciiBar ratio={progressPct} width={20} tone="accent2" />
          <div className="flex justify-between gap-2 text-xs text-muted">
            <span className="tabular-nums">
              {kr(current)} / {kr(target)}
            </span>
            <span className="tabular-nums">
              {paused ? "[ PAUSED ]" : velocity > 0 ? `${kr(velocity)}/mo · ETA ${fmtMonthYear(etaDate)}` : netPace < 0 ? `${kr(netPace)}/mo net` : "no pace yet"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] uppercase tracking-term">
            {!paused && <TrackTag track={track} pace={netPace} />}
            {accounts.map((a) => (
              <span key={a.accountId} className="border border-edge px-1.5 py-0.5 text-faint">
                <span style={{ color: a.color }}>{"\u25a0"}</span> {a.name}
                {a.sharePct < 100 ? ` ${a.sharePct}%` : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </a>
  );
}
