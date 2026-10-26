"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

interface Row {
  id: number;
  name: string;
  color: string;
  balance: number;
  sharePct: number; // this goal's share (0 = not linked)
  usedElsewhere: number; // share other goals already take
}

/** Pick which investment accounts fund this goal, and how much of each. */
export function GoalAccounts({ goalId }: { goalId: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/goals/${goalId}/accounts`)
      .then((r) => r.json())
      .then((d: { accounts?: Row[] }) => setRows(d.accounts ?? []))
      .catch(() => setRows([]));
  }, [goalId]);

  function update(id: number, sharePct: number) {
    setRows((rs) =>
      rs?.map((r) => (r.id === id ? { ...r, sharePct: Math.max(0, Math.min(100 - r.usedElsewhere, sharePct)) } : r)) ?? rs
    );
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/goals/${goalId}/accounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: rows.filter((r) => r.sharePct > 0).map((r) => ({ accountId: r.id, sharePct: r.sharePct })) }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setMsg(`[FAIL] ${error}`);
      return;
    }
    setDirty(false);
    setMsg("[OK] saved");
    start(() => router.refresh());
  }

  if (rows === null) return <p className="text-[0.7rem] uppercase tracking-term text-muted">loading...</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No investment accounts yet. Add Lysa / Avanza / LF Fonder in the investments panel on the overview.
      </p>
    );
  }

  const linkedValue = rows.reduce((s, r) => s + (r.balance * r.sharePct) / 100, 0);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm tabular-nums">
        <tbody>
          {rows.map((r) => {
            const free = 100 - r.usedElsewhere;
            const linked = r.sharePct > 0;
            return (
              <tr key={r.id} className="border-b border-grid">
                <td className="py-1.5 pr-3">
                  <label className="flex cursor-pointer items-center gap-2 uppercase tracking-term">
                    <input
                      type="checkbox"
                      checked={linked}
                      disabled={free <= 0 && !linked}
                      onChange={(e) => update(r.id, e.target.checked ? free : 0)}
                      className="accent-accent"
                    />
                    <span style={{ color: r.color }}>{"\u25a0"}</span>
                    <span className={linked ? "text-ink2" : "text-muted"}>{r.name}</span>
                  </label>
                </td>
                <td className="py-1.5 pr-3 text-right text-muted">{kr(r.balance)}</td>
                <td className="w-28 py-1.5 pr-3 text-right">
                  {linked ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={free}
                        value={r.sharePct}
                        onChange={(e) => update(r.id, Number(e.target.value))}
                        className="input w-16 !px-1.5 !py-0.5 text-right"
                        aria-label={`${r.name} share`}
                      />
                      <span className="text-faint">%</span>
                    </span>
                  ) : (
                    <span className="text-[0.65rem] text-faint">
                      {free <= 0 ? "fully used" : r.usedElsewhere > 0 ? `${free}% free` : ""}
                    </span>
                  )}
                </td>
                <td className="w-28 py-1.5 text-right text-accent2">
                  {linked ? `+${kr((r.balance * r.sharePct) / 100)}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-term text-faint">
        <span>from accounts {kr(linkedValue)}</span>
        <button onClick={save} disabled={!dirty || busy} className="btn btn-accent !py-0.5 text-[0.65rem]">
          {busy ? "…" : "save funding"}
        </button>
        {msg && <span className={msg.startsWith("[OK]") ? "text-ok" : "text-danger"}>{msg}</span>}
      </div>
    </div>
  );
}
