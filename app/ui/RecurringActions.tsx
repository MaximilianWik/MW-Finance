"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Glyph, StatusTag } from "./StatusTag";
import type { BillItem } from "@/lib/behavior/checklist";
import { kr, shortDate } from "@/lib/format";

/** One row in the bills checklist with inline notes edit and soft-delete. */
export function BillRow({ item }: { item: BillItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, start] = useTransition();

  const stateGlyph: Record<BillItem["state"], React.ComponentProps<typeof Glyph>["state"]> = {
    paid: "ok", due: "empty", overdue: "warn", upcoming: "empty", missed: "fail",
  };
  const stateTone: Record<BillItem["state"], React.ComponentProps<typeof StatusTag>["tone"]> = {
    paid: "ok", due: "muted", overdue: "danger", upcoming: "muted", missed: "danger",
  };

  async function saveNotes() {
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, notes: notes.trim() || null }),
    });
    setEditing(false);
    start(() => router.refresh());
  }

  async function del() {
    if (!confirm(`Remove "${item.displayName}" from the checklist?`)) return;
    await fetch(`/api/recurring?id=${item.id}`, { method: "DELETE" });
    start(() => router.refresh());
  }

  return (
    <tr className={item.state === "overdue" || item.state === "missed" ? "bg-danger/5" : undefined}>
      <td className="w-7">
        <Glyph state={stateGlyph[item.state]} />
      </td>
      <td>
        <div className="flex flex-col gap-0.5">
          <span className="uppercase tracking-term text-ink2">{item.displayName}</span>
          {item.notes && item.merchant !== item.notes && (
            <span className="text-[0.68rem] text-muted">alias for: {item.merchant}</span>
          )}
          {editing && (
            <div className="mt-1 flex items-center gap-1">
              <input
                autoFocus
                className="input !py-0.5 flex-1 text-xs"
                placeholder="notes / display name…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNotes();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <button onClick={saveNotes} disabled={busy} className="btn !py-0.5 btn-accent">save</button>
              <button onClick={() => setEditing(false)} className="btn !py-0.5">esc</button>
            </div>
          )}
        </div>
      </td>
      <td className="w-24 text-right text-muted">−{kr(item.amount)}</td>
      <td className="w-20 text-center">
        <StatusTag tone={stateTone[item.state]}>{item.state}</StatusTag>
      </td>
      <td className="w-20 text-right text-faint">{shortDate(item.expectedOn)}</td>
      <td className="w-20 text-right">
        <div className="flex justify-end gap-1">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="btn !px-1.5 !py-0.5 text-[0.65rem]"
              title="Edit notes / display name"
            >
              notes
            </button>
          )}
          <button
            onClick={del}
            disabled={busy}
            className="btn btn-danger !px-1.5 !py-0.5 text-[0.65rem]"
            title="Remove from checklist"
          >
            del
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Mark-as-recurring button placed in the TxRow action area. */
export function MarkRecurring({ txId, merchant }: { txId: number; merchant: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  async function mark() {
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txId }),
    });
    if (res.ok) {
      setDone(true);
      start(() => router.refresh());
    }
  }

  if (done) return <span className="text-[0.65rem] text-ok">[✓] recurring</span>;

  return (
    <button
      onClick={mark}
      disabled={busy}
      title={`Mark "${merchant}" as recurring`}
      className="btn border-ok/40 text-ok !px-1.5 !py-0.5 text-[0.65rem] opacity-0 transition-opacity group-hover/row:opacity-100 hover:border-ok hover:bg-ok/10"
    >
      + recurring
    </button>
  );
}
