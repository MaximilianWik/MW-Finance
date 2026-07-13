import { NextRequest, NextResponse } from "next/server";
import { runGameEval } from "@/lib/game/eval";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reactor Core eval.
 *   GET  → nightly cron. Requires `Authorization: Bearer <CRON_SECRET>`.
 *   POST → manual trigger. Streams the eval log line-by-line.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGameEval();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST() {
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));
      try {
        send("[EXEC] running reactor eval...");
        const r = await runGameEval(send);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        send(`[DONE] tier ${r.tier} · streak ${r.currentStreak}d (best ${r.bestStreak}d) · ${secs}s`);
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
