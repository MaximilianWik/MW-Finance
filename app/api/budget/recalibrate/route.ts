import { NextRequest } from "next/server";
import { proposeBudget, applyBudgetProposal, MAX_CHANGE_PCT, type BudgetSet } from "@/lib/gemini/budget";
import { syncBudgetLocks, type BudgetPlan } from "@/lib/budget-rules";

function planLine(p: BudgetPlan): string {
  if (p.overBy > 0) return `[WARN] limits exceed income (${kr(p.income)}) by ${kr(p.overBy)}`;
  return `[..]   zero-based: income ${kr(p.income)} · assigned ${kr(p.assigned)} · unassigned ${kr(p.unassigned)}`;
}
import { kr } from "@/lib/format";

/** "Shopping 1 500 → 1 800 kr (+20%) · median 1 450 · AI asked 2 500, capped" */
function changeLine(s: BudgetSet): string {
  const from = s.current != null ? `${kr(s.current)} → ` : "";
  const pct =
    s.current != null && s.current > 0
      ? ` (${s.monthly >= s.current ? "+" : ""}${Math.round(((s.monthly - s.current) / s.current) * 100)}%)`
      : "";
  const median = s.median != null ? ` · median ${kr(s.median)}` : "";
  const cap = s.clamped && s.aiMonthly != null ? ` · AI asked ${kr(s.aiMonthly)}, capped` : "";
  const fill = s.fill ? ` · ${s.fill > 0 ? "+" : "−"}${kr(Math.abs(s.fill))} fill` : "";
  return `${s.name} ${from}${kr(s.monthly)}${pct}${median}${cap}${fill}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI budget recalibration — streaming.
 *
 *   POST                 → propose, stream reasoning, then APPLY and stream
 *                          [SET]/[NEW]/[SKIP] logs.
 *   POST ?preview=1      → propose and stream reasoning + proposed changes
 *                          WITHOUT writing anything.
 */
export async function POST(req: NextRequest) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  let guidance: string | undefined;
  try {
    const b = (await req.json()) as { guidance?: unknown };
    if (typeof b?.guidance === "string" && b.guidance.trim()) guidance = b.guidance.trim();
  } catch {
    // no body / not JSON — guidance stays undefined
  }
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));
      try {
        const { bills, plan } = await syncBudgetLocks();
        send(planLine(plan));
        if (bills.count > 0) {
          send(`[..]   bills locked to checklist: ${kr(bills.total)} (${bills.count} bill(s))${bills.changed ? " · updated" : ""}`);
        }
        send("[AI]   reading income, spending habits, recurring commitments…");
        if (guidance) send(`[AI]   guidance: ${guidance} (±${MAX_CHANGE_PCT * 100}% limit lifted)`);
        const proposal = await proposeBudget(guidance);
        send(`[..]   baseline: median of last ${proposal.baselineCycles} finished cycle(s)`);
        for (const o of proposal.oneOffs) {
          send(
            `       [ONE-OFF] ${o.bookingDate} ${o.merchant ?? "?"} ${kr(o.amount)} in ${o.categoryName} (normal ~${kr(o.typical)}), excluded`
          );
        }
        for (const line of proposal.reasoning) send(`[AI]   ${line}`);
        for (const d of proposal.dropped) send(`       [LOCK] ${d.name}: ${d.reason}, ignored`);
        const z = proposal.zeroBased;
        send(
          z.filled
            ? `[..]   zero-based fill: ${kr(z.income)} income − ${kr(z.fixed)} fixed = ${kr(z.target)} spread over the unlocked categories`
            : `[..]   zero-based: nothing to fill (already at ${kr(z.target)}, or every category is locked/manual)`
        );
        send(
          `[OK]   proposal ready — ${proposal.sets.length} change(s), ${proposal.unchanged} unchanged, ${proposal.newCategories.length} new categor${proposal.newCategories.length === 1 ? "y" : "ies"}`
        );

        if (preview) {
          for (const s of proposal.sets) {
            send(`       [SET] ${changeLine(s)}${s.rationale ? " — " + s.rationale : ""}`);
          }
          for (const n of proposal.newCategories) {
            send(`       [NEW] ${n.name} ${kr(n.monthly)}${n.rationale ? " — " + n.rationale : ""}`);
          }
          send("[DONE] preview only — nothing written. run recalibrate to apply.");
        } else {
          send("[AI]   applying budget…");
          const byName = new Map(proposal.sets.map((s) => [s.name, s]));
          await applyBudgetProposal(proposal, (a) => {
            const amt = a.monthly != null ? ` ${kr(a.monthly)}` : "";
            const reason = a.reason ? ` — ${a.reason}` : "";
            const s = byName.get(a.name);
            if (a.kind === "set") send(`       [SET] ${s ? changeLine(s) : a.name + amt}${reason}`);
            else if (a.kind === "new") send(`       [NEW] ${a.name}${amt}${reason}`);
            else send(`       [SKIP] ${a.name}${reason}`);
          });
          send(planLine((await syncBudgetLocks()).plan));
          const secs = ((Date.now() - t0) / 1000).toFixed(1);
          send(`[DONE] budget recalibrated — ${secs}s`);
        }
      } catch (e) {
        send(`[FAIL] ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
