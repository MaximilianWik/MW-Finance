"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";

/** Client-side downscale of an image to ≤ 1024 px on the long edge, JPEG. */
async function downscaleImage(file: File, maxDim = 1024, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      "image/jpeg",
      quality
    )
  );
}

export function GoalActions({
  goalId,
  isPrimary,
  paused,
}: {
  goalId: number;
  isPrimary: boolean;
  paused: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContribute(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount) return;
    const res = await fetch(`/api/goals/${goalId}/contributions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), note: note || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "failed");
      return;
    }
    setAmount("");
    setNote("");
    start(() => router.refresh());
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const scaled = await downscaleImage(file);
      const form = new FormData();
      form.append("file", scaled, file.name.replace(/\.[^.]+$/, "") + ".jpg");
      const res = await fetch(`/api/goals/${goalId}/image`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "upload failed");
        return;
      }
      start(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function toggle(field: "isPrimary" | "paused") {
    const res = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: goalId,
        [field]: field === "isPrimary" ? !isPrimary : !paused,
      }),
    });
    if (res.ok) start(() => router.refresh());
  }

  async function onDelete() {
    if (!confirm("Delete this goal? Contributions are removed too.")) return;
    const res = await fetch(`/api/goals?id=${goalId}`, { method: "DELETE" });
    if (res.ok) start(() => router.push("/goals"));
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onContribute} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            required
            placeholder="amount kr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input w-28 tabular-nums"
          />
          <input
            placeholder="note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input flex-1"
          />
          <button type="submit" disabled={busy} className="btn btn-accent">
            + add {amount ? kr(Number(amount)) : ""}
          </button>
        </div>
        {error && <p className="text-sm text-danger">[ FAIL ] {error}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onImage}
          disabled={uploading}
          className="text-xs text-muted file:mr-3 file:border file:border-edge file:bg-panel2 file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-widest file:text-accent"
        />
        {uploading && <span className="text-xs text-muted">uploading…</span>}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
        <button onClick={() => toggle("isPrimary")} className="btn">
          {isPrimary ? "unset primary" : "set primary"}
        </button>
        <button onClick={() => toggle("paused")} className="btn">
          {paused ? "resume" : "pause"}
        </button>
        <button onClick={onDelete} className="btn btn-danger">
          delete
        </button>
      </div>
    </div>
  );
}
