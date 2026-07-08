import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual trigger from the dashboard UI. Streams the sync log line-by-line
// (newline-delimited) so the console scrolls live. No secret required — this is
// a personal app and the endpoint only pulls + processes your own bank data.
export async function POST() {
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));
      try {
        await runSync({ useGemini: true, onLog: send });
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        send(`[DONE] wall time ${secs}s`);
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
