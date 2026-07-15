import { NextRequest, NextResponse } from "next/server";
import { runEventSuggestions } from "@/lib/lifestyle/events";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Month-ahead event scout (Phase 6).
 *
 *   GET  → weekly cron. Requires `Authorization: Bearer <CRON_SECRET>`.
 *          Runs the scout, returns JSON.
 *   POST → manual trigger from /weekend. Streams the run log line-by-line.
 *          No secret (personal app, own data only).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { inserted } = await runEventSuggestions();
    return NextResponse.json({ ok: true, count: inserted });
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
        await runEventSuggestions(send);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        send(`[DONE] scout complete — ${secs}s`);
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
