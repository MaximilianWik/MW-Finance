import { NextRequest, NextResponse } from "next/server";
import { saveReflection, VERDICTS, type Verdict } from "@/lib/game/reflections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record a "still glad you got this?" verdict for a discretionary purchase.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { transactionId?: number; verdict?: string };
  if (!body.transactionId || !body.verdict) {
    return NextResponse.json(
      { error: "transactionId and verdict required" },
      { status: 400 }
    );
  }
  if (!VERDICTS.includes(body.verdict as Verdict)) {
    return NextResponse.json(
      { error: `verdict must be one of ${VERDICTS.join(", ")}` },
      { status: 400 }
    );
  }

  await saveReflection(body.transactionId, body.verdict as Verdict);
  return NextResponse.json({ ok: true });
}
