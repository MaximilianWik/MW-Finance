"use client";

import { useCallback, useEffect, useState } from "react";
import { kr, krSigned } from "@/lib/format";

interface AccountRow {
  id: number;
  name: string;
  color: string;
  merchant: string | null;
  seedBalance: number;
  seedDate: string | null;
  currency: string;
  sort: number;
  currentBalance: number;
  delta: number;
  deposits: number;
  withdrawals: number;
  txCount: number;
}

interface ApiResponse {
  accounts: AccountRow[];
  total: number;
}

/**
 * Per-account investment balance tracker.
 *
 * Each account has a seed balance (set manually) and a delta computed from
 * transactions matching the account's merchant key:
 *   DBIT to merchant → deposit  (balance goes up)
 *   CRDT from merchant → withdrawal (balance goes down)
 *
 * "Set balance" resets the seed to the entered value and stamps today as the
 * new baseline, so only future transactions are applied on top.
 */
export function InvestmentsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newColor, setNewColor] = useState("#3ea0c8");

  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/investments");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function setBalance(id: number) {
    const val = Number(editVal);
    if (isNaN(val)) return;
    setBusy(true);
    await fetch("/api/investments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, balance: val }),
    });
    setEditId(null);
    await fetchAll();
    setBusy(false);
  }

  async function deleteAccount(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    await fetch(`/api/investments?id=${id}`, { method: "DELETE" });
    await fetchAll();
    setBusy(false);
  }

  async function addAccount() {
    if (!newName.trim()) return;
    setBusy(true);
    await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:    newName.trim(),
        color:   newColor,
        balance: newBalance ? Number(newBalance) : 0,
      }),
    });
    setNewName(""); setNewBalance(""); setNewColor("#3ea0c8");
    setAddOpen(false);
    await fetchAll();
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="panel">
        <span className="panel-title">[ INVESTMENTS ]</span>
        <p className="py-4 text-center text-sm text-muted">loading…</p>
      </div>
    );
  }

  const accounts = data?.accounts ?? [];
  const total    = data?.total ?? 0;

  return (
    <div className="panel">
      <span className="panel-title">[ INVESTMENTS ]</span>
      <span className="absolute -top-[0.62rem] right-3 bg-ink px-2 text-[0.7rem] uppercase tracking-term text-ink2">
        {kr(total)}
      </span>

      <div className="flex flex-col">
        {accounts.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            No accounts yet. Add one below.
          </p>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} className="border-b border-grid py-2 last:border-0">
              {editId === acc.id ? (
                /* ─── Edit row ─────────────────────── */
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 text-[0.75rem] uppercase tracking-term text-ink2"
                        style={{ color: acc.color }}>■</span>
                  <span className="text-[0.75rem] uppercase tracking-term text-ink2 mr-1">
                    {acc.name}
                  </span>
                  <label className="prompt flex-1 min-w-[8rem]">
                    <span className="sigil text-faint">kr</span>
                    <input
                      autoFocus
                      type="number"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setBalance(acc.id);
                        if (e.key === "Escape") setEditId(null);
                      }}
                      className="!w-full tabular-nums text-xs"
                      placeholder="amount"
                    />
                  </label>
                  <button
                    onClick={() => setBalance(acc.id)}
                    disabled={busy}
                    className="btn btn-accent !py-0.5 !px-2 text-xs"
                  >
                    $ set
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="btn !py-0.5 !px-2 text-xs"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                /* ─── Display row ──────────────────── */
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-2 text-[0.75rem] uppercase tracking-term text-ink2">
                      <span style={{ color: acc.color }}>■</span>
                      {acc.name}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="tabular-nums text-sm font-medium text-ink2">
                        {kr(acc.currentBalance)}
                      </span>
                      <button
                        onClick={() => { setEditId(acc.id); setEditVal(String(acc.currentBalance)); }}
                        className="btn !py-0 !px-1.5 text-[0.65rem] opacity-50 hover:opacity-100"
                        title="Set balance"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteAccount(acc.id, acc.name)}
                        disabled={busy}
                        className="btn btn-danger !py-0 !px-1.5 text-[0.65rem] opacity-30 hover:opacity-100"
                        title="Delete account"
                      >
                        del
                      </button>
                    </div>
                  </div>

                  {/* Delta breakdown */}
                  {acc.txCount > 0 && (
                    <p className="mt-0.5 text-[0.65rem] tabular-nums text-faint">
                      {acc.delta >= 0 ? "+" : ""}{kr(acc.delta)} · {acc.txCount} transaction{acc.txCount !== 1 ? "s" : ""} since base
                      {acc.seedDate && (
                        <span className="ml-1 text-faint/60">({acc.seedDate})</span>
                      )}
                    </p>
                  )}
                  {acc.txCount === 0 && acc.merchant && (
                    <p className="mt-0.5 text-[0.65rem] text-faint">
                      no new transactions since base
                    </p>
                  )}
                </>
              )}
            </div>
          ))
        )}

        {/* ─── Total row ───────────────────────────── */}
        {accounts.length > 1 && (
          <div className="mt-2 flex justify-between border-t border-edge pt-2 text-xs uppercase tracking-term">
            <span className="text-muted">total</span>
            <span className="tabular-nums font-medium text-ink2">{kr(total)}</span>
          </div>
        )}

        {/* ─── Add account ─────────────────────────── */}
        {addOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
            <span className="text-xs uppercase tracking-term text-accent">$ new</span>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="NAME"
              className="input w-28 uppercase tracking-term"
            />
            <label className="prompt w-28">
              <span className="sigil text-faint">kr</span>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder="0"
                className="!w-full tabular-nums text-xs"
              />
            </label>
            <button onClick={addAccount} disabled={busy || !newName.trim()} className="btn btn-accent">
              add
            </button>
            <button onClick={() => setAddOpen(false)} className="btn">cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 btn self-start text-xs"
          >
            + account
          </button>
        )}
      </div>
    </div>
  );
}
