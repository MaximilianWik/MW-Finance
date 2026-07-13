"use client";

import { useEffect, useState } from "react";

interface HourlyState {
  rate: number | null;
  source: "manual" | "derived" | "none";
  derived: number | null;
}

/**
 * Hourly-rate config. Shows the effective rate + where it came from (a manual
 * value or salary-derived), and lets the user override or clear it. The rate
 * powers the ledger's hours-worked cost chips.
 */
export function ProfilePanel() {
  const [state, setState] = useState<HourlyState | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: HourlyState) => {
        if (cancelled) return;
        setState(d);
        setValue(d.source === "manual" && d.rate != null ? String(Math.round(d.rate)) : "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(hourlyRate: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate }),
      });
      const d: HourlyState = await res.json();
      setState(d);
      setValue(d.source === "manual" && d.rate != null ? String(Math.round(d.rate)) : "");
    } finally {
      setSaving(false);
    }
  }

  const hint =
    state == null
      ? "loading…"
      : state.source === "manual"
        ? "manual override"
        : state.source === "derived"
          ? `derived from salary (median ÷ 160h)`
          : "no salary detected yet — set one to enable cost chips";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.7rem] leading-relaxed text-muted">
        Your hourly rate turns every purchase into hours worked. Leave it blank to
        auto-derive from your detected salary.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="prompt w-40">
          <span className="sigil">kr/h</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={value}
            placeholder={state?.derived ? String(Math.round(state.derived)) : "auto"}
            onChange={(e) => setValue(e.target.value)}
            className="!w-full text-right tabular-nums"
          />
        </label>
        <button
          className="btn btn-accent"
          disabled={saving}
          onClick={() => save(value === "" ? null : value)}
        >
          {saving ? "saving…" : "$ save"}
        </button>
        {state?.source === "manual" && (
          <button className="btn btn-danger text-[0.65rem]" disabled={saving} onClick={() => save(null)}>
            [ clear ]
          </button>
        )}
      </div>
      <p className="text-[0.65rem] uppercase tracking-term text-faint">
        effective: {state?.rate != null ? `${Math.round(state.rate)} kr/h` : "—"} · {hint}
      </p>
    </div>
  );
}
