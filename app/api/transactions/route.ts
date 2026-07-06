import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories, merchantCategories } from "@/db/schema";
import { and, desc, eq, gte, lte, ilike, sql, type SQL } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 100), 500);
  const conds: SQL[] = [];

  const month = sp.get("month");
  if (month) {
    const b = monthBounds(month);
    if (b) {
      conds.push(gte(transactions.bookingDate, b.from));
      conds.push(lte(transactions.bookingDate, b.to));
    }
  }
  const categoryId = sp.get("categoryId");
  if (categoryId) conds.push(eq(transactions.categoryId, Number(categoryId)));

  const accountUid = sp.get("accountUid");
  if (accountUid) conds.push(eq(transactions.accountUid, accountUid));

  const q = sp.get("q");
  if (q) conds.push(ilike(transactions.counterpartyName, `%${q}%`));

  const rows = await db
    .select({
      id: transactions.id,
      accountUid: transactions.accountUid,
      direction: transactions.direction,
      amount: sql<number>`${transactions.amount}::float`,
      signed: sql<number>`${transactions.signed}::float`,
      currency: transactions.currency,
      bookingDate: transactions.bookingDate,
      counterpartyName: transactions.counterpartyName,
      remittance: transactions.remittance,
      merchant: transactions.merchant,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(limit);

  return NextResponse.json({ transactions: rows });
}

// Manual category override. Also updates the merchant→category cache so future
// transactions from the same merchant auto-apply.
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { id?: number; categoryId?: number };
  if (!body.id || !body.categoryId) {
    return NextResponse.json({ error: "id and categoryId required" }, { status: 400 });
  }

  const [updated] = await db
    .update(transactions)
    .set({ categoryId: body.categoryId, categorySource: "manual" })
    .where(eq(transactions.id, body.id))
    .returning({ id: transactions.id, merchant: transactions.merchant });

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (updated.merchant) {
    await db
      .insert(merchantCategories)
      .values({ merchant: updated.merchant, categoryId: body.categoryId, source: "manual" })
      .onConflictDoUpdate({
        target: merchantCategories.merchant,
        set: { categoryId: body.categoryId, source: "manual", updatedAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
}
