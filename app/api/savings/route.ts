import { NextRequest, NextResponse } from "next/server";
import {
  getSavingsTotal,
  addSavingsEntry,
  deleteSavingsEntry,
} from "@/lib/savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { fromTransactions, fromManual, total, recentEntries }. */
export async function GET() {
  const data = await getSavingsTotal();
  return NextResponse.json(data);
}

/** POST { amount, note?, occurredOn? } -> add a manual savings entry. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    amount?: number;
    note?: string;
    occurredOn?: string;
  };
  if (body.amount == null || Number(body.amount) <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }
  const entry = await addSavingsEntry({
    amount: Number(body.amount),
    note: body.note?.trim() || null,
    occurredOn: body.occurredOn,
  });
  return NextResponse.json({ entry }, { status: 201 });
}

/** DELETE ?id= -> remove a manual savings entry. */
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteSavingsEntry(Number(id));
  return NextResponse.json({ ok: true });
}