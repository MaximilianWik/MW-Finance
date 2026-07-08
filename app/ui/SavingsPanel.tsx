"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kr, krSigned, shortDate } from "@/lib/format";
import { Panel } from "./Panel";

interface Entry {
  id: number;
  amount: number;
  note: string | null;
  occurredOn: string | null;
  kind: "manual";
}

interface SavingsData {
  fromTransactions: number;
  fromManual: number;
  total: number;
  recentEntries: Entry[];
}

/** All-time savings total (auto Savings outflows + manual) with inline add. */
export function SavingsPanel({ initial }: { initial: SavingsData }) {
  const router = useRouter();
  const [data, setData] = useState<SavingsData>(initial);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/savings");
    if (res.ok) setData((await res.json()) as SavingsData);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      await fetch("/api/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, note: note.trim() || undefined }),
      });
      setAmount("");
      setNote("");
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/savings?id=${id}`, { method: "DELETE" });
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="SAVINGS TOTAL" right={kr(data.total)}>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs uppercase tracking-term text-muted">
        <span>
          auto <span className="tabular-nums text-ink2">{kr(data.fromTransactions)}</span>
        </span>
        <span>
          manual <span className="tabular-nums text-ink2">{kr(data.fromManual)}</span>
        </span>
      </div>

      <form
        onSubmit={add}
        className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-term text-muted"
      >
        <span className="self-center text-accent">$ add</span>
        <label className="prompt w-32">
          <span className="sigil">kr</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            placeholder="amount"
            onChange={(e) => setAmount(e.target.value)}
            className="!w-full tabular-nums text-xs"
          />
        </label>
        <label className="prompt flex-1 min-w-[8rem]">
          <span className="sigil">--note</span>
          <input
            type="text"
            value={note}
            placeholder="note"
            onChange={(e) => setNote(e.target.value)}
            className="!w-full text-xs"
          />
        </label>
        <button type="submit" disabled={busy} className="btn btn-accent">
          {busy ? "..." : "$ save"}
        </button>
      </form>

      {data.recentEntries.length > 0 && (
        <table className="term-table mt-3">
          <tbody>
            {data.recentEntries.map((e) => (
              <tr key={e.id} className="group/row">
                <td className="w-16 whitespace-nowrap text-faint">{shortDate(e.occurredOn)}</td>
                <td className="max-w-0">
                  <span className="truncate text-muted">{e.note ?? "manual entry"}</span>
                </td>
                <td className="w-24 text-right text-accent">{krSigned(e.amount)}</td>
                <td className="w-8 text-right">
                  <button
                    onClick={() => del(e.id)}
                    disabled={busy}
                    title="delete"
                    className="text-faint opacity-0 transition-opacity hover:text-danger group-hover/row:opacity-100"
                  >
                    {"\u00d7"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}