"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface CatOption {
  id: number;
  name: string;
  emoji: string;
  color: string;
}

export function CategorySelect({
  txId,
  categoryId,
  options,
}: {
  txId: number;
  categoryId: number | null;
  options: CatOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(categoryId);
  const [pending, start] = useTransition();

  const current = options.find((o) => o.id === value);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value);
    setValue(next);
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txId, categoryId: next }),
    });
    if (res.ok) start(() => router.refresh());
  }

  return (
    <select
      value={value ?? ""}
      onChange={onChange}
      disabled={pending}
      className="input max-w-[9.5rem] cursor-pointer border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-edge"
      style={{ color: current?.color ?? "#8a97a6" }}
      aria-label="Category"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id} className="bg-panel text-white">
          {o.emoji} {o.name}
        </option>
      ))}
    </select>
  );
}
