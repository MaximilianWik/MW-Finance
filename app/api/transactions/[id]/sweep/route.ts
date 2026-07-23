import { NextRequest, NextResponse } from "next/server";
import { classifyTransactionAsSweep } from "@/lib/savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txId = Number(id);
  if (!Number.isFinite(txId) || txId <= 0) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 });
  }

  const result = await classifyTransactionAsSweep(txId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, contribution: result.contribution });
}
