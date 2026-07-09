import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recurringPayments, transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all active recurring payments (including manually added). */
export async function GET() {
  const rows = await db
    .select({
      id: recurringPayments.id,
      merchant: recurringPayments.merchant,
      notes: recurringPayments.notes,
      amount: sql<number>`${recurringPayments.amount}::float`,
      currency: recurringPayments.currency,
      cadence: recurringPayments.cadence,
      cadenceDays: recurringPayments.cadenceDays,
      lastDate: recurringPayments.lastDate,
      nextDate: recurringPayments.nextDate,
      occurrences: recurringPayments.occurrences,
      categoryId: recurringPayments.categoryId,
      manual: recurringPayments.manual,
      active: recurringPayments.active,
    })
    .from(recurringPayments)
    .where(eq(recurringPayments.active, true))
    .orderBy(recurringPayments.merchant);
  return NextResponse.json({ recurring: rows });
}

/**
 * Create a recurring entry manually or from a transaction.
 *
 * Body:
 *   { txId: number }                             — derive merchant/amount/date from tx
 *   { merchant, amount, cadence?, notes? }       — direct creation
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    txId?: number;
    merchant?: string;
    amount?: number;
    cadence?: string;
    notes?: string;
    nextDate?: string;
    variable?: boolean;
  };

  let merchant: string;
  let amount: number;
  let lastDate: string | null = null;
  let computedNextDate: string | null = body.nextDate ?? null;

  if (body.txId) {
    // Derive from a specific transaction
    const [tx] = await db
      .select({
        merchant: transactions.merchant,
        counterpartyName: transactions.counterpartyName,
        amount: sql<number>`${transactions.amount}::float`,
        bookingDate: transactions.bookingDate,
      })
      .from(transactions)
      .where(eq(transactions.id, body.txId))
      .limit(1);

    if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

    merchant = tx.merchant ?? tx.counterpartyName ?? `tx-${body.txId}`;
    amount = tx.amount;
    lastDate = tx.bookingDate ?? null;

    // Default next_date = last + 30 days (monthly assumption for manual add)
    if (!computedNextDate && lastDate) {
      const d = new Date(lastDate + "T00:00:00Z");
      computedNextDate = new Date(d.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
    }
  } else {
    if (!body.merchant || body.amount == null) {
      return NextResponse.json({ error: "merchant and amount required" }, { status: 400 });
    }
    merchant = body.merchant;
    amount = Number(body.amount);
  }

  const [created] = await db
    .insert(recurringPayments)
    .values({
      merchant,
      notes: body.notes ?? null,
      amount: amount.toFixed(2),
      cadence: body.cadence ?? "monthly",
      lastDate: lastDate ?? undefined,
      nextDate: computedNextDate ?? undefined,
      manual: true,
      active: true,
      variableAmount: body.variable === true,
    })
    .onConflictDoUpdate({
      target: recurringPayments.merchant,
      set: {
        notes: body.notes ?? null,
        manual: true,
        active: true,
        variableAmount: body.variable === true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ recurring: created }, { status: 201 });
}

/** Update notes, cadence, nextDate, or active flag. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: number;
    notes?: string | null;
    cadence?: string;
    nextDate?: string | null;
    active?: boolean;
    categoryId?: number | null;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.notes !== undefined) set.notes = body.notes;
  if (body.cadence !== undefined) set.cadence = body.cadence;
  if (body.nextDate !== undefined) set.nextDate = body.nextDate;
  if (body.active !== undefined) set.active = body.active;
  if (body.categoryId !== undefined) set.categoryId = body.categoryId;

  const [updated] = await db
    .update(recurringPayments)
    .set(set)
    .where(eq(recurringPayments.id, body.id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ recurring: updated });
}

/** Soft-delete: set active=false. Accepts ?id= or ?merchant= (the ledger
 *  unmark passes the normalized merchant since it has no recurring row id). */
export async function DELETE(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const merchant = sp.get("merchant");
  if (!id && !merchant) {
    return NextResponse.json({ error: "id or merchant required" }, { status: 400 });
  }
  await db
    .update(recurringPayments)
    .set({ active: false, updatedAt: new Date() })
    .where(id ? eq(recurringPayments.id, Number(id)) : eq(recurringPayments.merchant, merchant!));
  return NextResponse.json({ ok: true });
}
