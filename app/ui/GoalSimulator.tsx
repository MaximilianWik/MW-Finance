"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import {
  addMonths,
  monthsBetween,
  monthsToTarget,
  projectSeries,
  requiredMonthly,
  MAX_MONTHS,
  fmtMonthYear as fmtDate,
} from "@/lib/goal-math";
import { GoalChart } from "./GoalChart";

const CHART_MAX_MONTHS = 360; // 30 years is plenty to draw

function fmtMonths(n: number | null): string {
  if (n == null) return "never at this pace";
  if (n === 0) return "reached";
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y ? `${y}y` : "", m ? `${m}mo` : ""].filter(Boolean).join(" ");
}

/**
 * Live what-if for one goal. Everything is computed in the browser from the
 * goal's current value and pace; nothing is saved except the optional
 * "use as Savings budget" action.
 */
export function GoalSimulator({
  current,
  target,
  pace,
  targetDate,
  savingsCategoryId,
  savingsBudget,
}: {
  current: number;
  target: number;
  pace: number; // median kr per cycle
  targetDate: string | null;
  savingsCategoryId: number | null;
  savingsBudget: number | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const [extra, setExtra] = useState(0);
  const [ret, setRet] = useState(0);
  const [date, setDate] = useState(targetDate ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const r = useMemo(() => {
    const simPace = pace + extra;
    const base = monthsToTarget(current, target, pace, ret);
    const sim = monthsToTarget(current, target, simPace, ret);
    const dateMonths = date ? monthsBetween(today, date) : null;
    // Return earned by the finish month: final balance − start − deposits.
    const earned = (months: number | null, monthly: number) =>
      ret > 0 && months != null && months > 0
        ? Math.round(projectSeries(current, monthly, months, ret)[months] - current - monthly * months)
        : null;
    const needed = dateMonths != null ? requiredMonthly(current, target, dateMonths, ret) : null;

    // Frame the chart on the line you are looking at (simulated if extra > 0,
    // else current pace) plus the finish date; a far-off line just runs off the edge.
    const focus = extra > 0 ? sim : base;
    const horizon = Math.min(
      CHART_MAX_MONTHS,
      Math.max(
        12,
        ...[focus, dateMonths].filter((v): v is number => v != null && v <= MAX_MONTHS).map((v) => v + 6),
        focus == null && dateMonths == null ? 120 : 0
      )
    );
    return {
      simPace,
      base,
      sim,
      saved: base != null && sim != null ? base - sim : null,
      baseEarned: earned(base, pace),
      simEarned: earned(sim, simPace),
      dateMonths,
      needed,
      neededGap: needed != null ? needed - pace : null,
      paceSeries: projectSeries(current, pace, horizon, ret),
      simSeries: extra > 0 ? projectSeries(current, simPace, horizon, ret) : null,
    };
  }, [current, target, pace, extra, ret, date, today]);

  // Budget suggestion: what the date needs, else the simulated pace.
  const suggestion = Math.ceil((r.needed ?? r.simPace) / 50) * 50;

  async function applyBudget() {
    if (savingsCategoryId == null) return;
    setMsg(null);
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: savingsCategoryId, budgetMonthly: String(suggestion) }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setMsg(`[FAIL] ${error}`);
      return;
    }
    setMsg(`[OK] savings budget set to ${kr(suggestion)}`);
    start(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-term text-faint">
          <span>
            extra per month <span className="text-accent">+{kr(extra)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={15000}
            step={250}
            value={extra}
            onChange={(e) => setExtra(Number(e.target.value))}
            className="accent-accent"
          />
          <span className="normal-case tracking-normal">
            pace {kr(pace)} → <span className="text-ink2">{kr(r.simPace)}</span> /mo
          </span>
        </label>

        <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-term text-faint">
          <span>
            yearly return <span className="text-accent2">{ret.toFixed(1)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={ret}
            onChange={(e) => setRet(Number(e.target.value))}
            className="accent-accent"
          />
          <span className="normal-case tracking-normal">0% = deposits only (safe)</span>
        </label>

        <label className="flex flex-col gap-1 text-[0.65rem] uppercase tracking-term text-faint">
          <span>finish by</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="input" />
          {date && (
            <button type="button" onClick={() => setDate("")} className="self-start text-faint hover:text-accent">
              clear
            </button>
          )}
        </label>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-3">
        <div className="border border-edge px-3 py-2">
          <p className="text-[0.6rem] uppercase tracking-term text-faint">at current pace</p>
          <p className="tabular-nums text-ink2">{fmtDate(r.base != null ? addMonths(today, r.base) : null)}</p>
          <p className="text-[0.65rem] text-muted">{fmtMonths(r.base)}</p>
          {r.baseEarned != null && <p className="text-[0.65rem] text-accent2">+{kr(r.baseEarned)} from return</p>}
        </div>
        <div className={`border px-3 py-2 ${extra > 0 ? "border-accent/50" : "border-edge"}`}>
          <p className="text-[0.6rem] uppercase tracking-term text-faint">simulated</p>
          <p className="tabular-nums text-accent">{fmtDate(r.sim != null ? addMonths(today, r.sim) : null)}</p>
          <p className="text-[0.65rem] text-muted">
            {fmtMonths(r.sim)}
            {r.saved != null && r.saved > 0 && <span className="text-accent"> · {fmtMonths(r.saved)} sooner</span>}
          </p>
          {r.simEarned != null && <p className="text-[0.65rem] text-accent2">+{kr(r.simEarned)} from return</p>}
        </div>
        <div className="border border-edge px-3 py-2">
          <p className="text-[0.6rem] uppercase tracking-term text-faint">needed per cycle {date ? `by ${fmtDate(date)}` : ""}</p>
          {r.needed != null ? (
            <>
              <p className="tabular-nums text-ink2">{kr(Math.ceil(r.needed))}</p>
              <p className={`text-[0.65rem] ${r.neededGap! > 0 ? "text-danger" : "text-ok"}`}>
                {r.neededGap! > 0 ? `+${kr(Math.ceil(r.neededGap!))} over your pace` : "your pace already covers it"}
              </p>
            </>
          ) : (
            <p className="text-[0.65rem] text-muted">pick a date to see it</p>
          )}
        </div>
      </div>

      <GoalChart
        pace={r.paceSeries}
        sim={r.simSeries}
        paceMonthly={pace}
        simMonthly={r.simPace}
        target={target}
        today={today}
        targetMonth={r.dateMonths}
      />
      <p className="text-[0.6rem] uppercase tracking-term text-faint">
        <span className="text-muted">grey</span> = current pace · <span className="text-accent">green</span> = simulated ·{" "}
        <span className="text-amber">dashed</span> = target · hover or drag for details
      </p>

      {savingsCategoryId != null && (
        <div className="flex flex-wrap items-center gap-2 border-t border-grid pt-3 text-[0.65rem] uppercase tracking-term text-faint">
          <span>
            savings budget now {savingsBudget != null ? kr(savingsBudget) : "not set"}
          </span>
          <button type="button" onClick={applyBudget} className="btn btn-accent !py-0.5 text-[0.65rem]">
            use {kr(suggestion)} as savings budget
          </button>
          {msg && <span className={msg.startsWith("[OK]") ? "text-ok" : "text-danger"}>{msg}</span>}
        </div>
      )}
    </div>
  );
}
