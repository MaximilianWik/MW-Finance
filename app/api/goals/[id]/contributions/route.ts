import { NextRequest, NextResponse } from "next/server";
import { addContribution, getGoalContributions } from "@/lib/savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await getGoalContributions(Number(id));
  return NextResponse.json({ contributions: rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { amount?: number; note?: string };
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }
  await addContribution({
    goalId: Number(id),
    amount: Number(body.amount),
    source: "manual",
    note: body.note,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
