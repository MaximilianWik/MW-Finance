import { NextRequest } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { desc, eq, isNull, ne, or } from "drizzle-orm";
import { categorizeBatch, type CatRow } from "@/lib/categorize-batch";
import { detectAndPersistRecurrings } from "@/lib/behavior/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_CAP = 200; // keep a single run inside the serverless time budget

/**
 * Ledger "categorize" action — streaming.
 *
 * Runs the AI categorization engine (rules → merchant cache → Gemini) over the
 * existing backlog: transactions never confidently categorized (source null or
 * 'default'). Streams a per-transaction [✓] log ending with a [DONE] summary.
 *
 *   POST         → categorize the uncategorized backlog
 *   POST ?all=1  → re-categorize every non-manual transaction (manual overrides kept)
 */
export async function POST(req: NextRequest) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));
      try {
        send("[AI]   scanning ledger for transactions to categorize…");

        const where = all
          ? // everything except rows the user manually categorized
            or(isNull(transactions.categorySource), ne(transactions.categorySource, "manual"))
          : // just the backlog that was never confidently categorized
            or(isNull(transactions.categorySource), eq(transactions.categorySource, "default"));

        const rows = await db
          .select({
            id: transactions.id,
            merchant: transactions.merchant,
            counterpartyName: transactions.counterpartyName,
            remittance: transactions.remittance,
            mcc: transactions.mcc,
            direction: transactions.direction,
          })
          .from(transactions)
          .where(where)
          .orderBy(desc(transactions.bookingDate), desc(transactions.id))
          .limit(BATCH_CAP);

        if (rows.length === 0) {
          send("[OK]   ledger is clean — scanning for recurring patterns anyway…");
          const detected = await detectAndPersistRecurrings();
          send(`[DONE] ${detected.length} recurring pattern(s) detected`);
          return;
        }

        send(`[OK]   ${rows.length} transaction(s) queued${rows.length === BATCH_CAP ? " (capped — run again for more)" : ""}`);

        const stats = await categorizeBatch(rows as CatRow[], { useGemini: true, onLog: send });
        const parts = [
          stats.rule > 0 ? `${stats.rule} rule` : "",
          stats.cache > 0 ? `${stats.cache} cache` : "",
          stats.gemini > 0 ? `${stats.gemini} ai` : "",
          stats.def > 0 ? `${stats.def} default` : "",
        ].filter(Boolean);
        send(`[OK]   categorized: ${parts.join(", ") || "none"}`);

        // After categorizing, scan full history for recurring patterns so newly
        // categorized merchants get picked up as recurring (including variable-price ones).
        send("[AI]   scanning for recurring patterns…");
        const detected = await detectAndPersistRecurrings();
        const varCount = detected.filter((d) => d.variableAmount).length;
        send(
          `[OK]   ${detected.length} recurring pattern(s) detected` +
          (varCount > 0 ? ` (${varCount} variable-price)` : "")
        );

        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        send(`[DONE] categorization complete — ${secs}s`);
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
