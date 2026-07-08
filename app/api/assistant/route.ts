import { NextRequest } from "next/server";
import { streamAssistant, type ChatTurn } from "@/lib/gemini/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conversational assistant — streams a plain-text answer. Financial context is
 * injected server-side on every call; the client sends the running history so
 * follow-ups keep continuity.
 */
export async function POST(req: NextRequest) {
  const { question, history } = (await req.json()) as {
    question?: string;
    history?: ChatTurn[];
  };

  if (!question || !question.trim()) {
    return new Response("[FAIL] empty question", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamAssistant(question, history ?? [])) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`\n[FAIL] ${e instanceof Error ? e.message : String(e)}`)
        );
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
