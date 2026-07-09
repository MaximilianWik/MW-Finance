"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Toggle button for a recurring payment's detection source.
 *
 * manual = user-created or promoted
 * auto   = detected from transaction history
 *
 * Clicking flips the flag and PATCHes /api/recurring.
 */
export function RecurringTypeToggle({
  id,
  manual: initialManual,
}: {
  id: number;
  manual: boolean;
}) {
  const router = useRouter();
  const [manual, setManual] = useState(initialManual);
  const [busy, start] = useTransition();

  async function toggle() {
    const next = !manual;
    setManual(next);
    await fetch("/api/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, manual: next }),
    });
    start(() => router.refresh());
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={`Click to mark as ${manual ? "auto-detected" : "manual"}`}
      className={
        "tag transition-opacity hover:opacity-70 disabled:opacity-40 " +
        (manual ? "tag-accent" : "tag-muted")
      }
    >
      {manual ? "manual" : "auto"}
    </button>
  );
}
