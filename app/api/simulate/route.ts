import { NextRequest, NextResponse } from "next/server";
import { simulate } from "@/lib/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    amount?: number;
    categoryId?: number;
    day?: number;
  };
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }
  if (!body.categoryId) {
    return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  }
  const result = await simulate({
    amount: Number(body.amount),
    categoryId: Number(body.categoryId),
    day: body.day ? Number(body.day) : undefined,
  });
  return NextResponse.json(result);
}
