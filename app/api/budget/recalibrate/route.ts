import { NextRequest } from "next/server";
import { proposeBudget, applyBudgetProposal } from "@/lib/gemini/budget";
import { kr } from "@/lib/format";

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
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));
      try {
        send("[AI]   reading income, spending habits, recurring commitments…");
        const proposal = await proposeBudget();
        for (const line of proposal.reasoning) send(`[AI]   ${line}`);
        send(
          `[OK]   proposal ready — ${proposal.sets.length} budget(s), ${proposal.newCategories.length} new categor${proposal.newCategories.length === 1 ? "y" : "ies"}`
        );

        if (preview) {
          for (const s of proposal.sets) {
            send(`       [SET] ${s.name} ${kr(s.monthly)}${s.rationale ? " — " + s.rationale : ""}`);
          }
          for (const n of proposal.newCategories) {
            send(`       [NEW] ${n.name} ${kr(n.monthly)}${n.rationale ? " — " + n.rationale : ""}`);
          }
          send("[DONE] preview only — nothing written. run recalibrate to apply.");
        } else {
          send("[AI]   applying budget…");
          await applyBudgetProposal(proposal, (a) => {
            const amt = a.monthly != null ? ` ${kr(a.monthly)}` : "";
            const reason = a.reason ? ` — ${a.reason}` : "";
            if (a.kind === "set") send(`       [SET] ${a.name}${amt}${reason}`);
            else if (a.kind === "new") send(`       [NEW] ${a.name}${amt}${reason}`);
            else send(`       [SKIP] ${a.name}${reason}`);
          });
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
