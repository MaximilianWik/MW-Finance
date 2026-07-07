import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { isSelfTransfer } from "@/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time backfill: re-run self-transfer detection over every existing
 * transaction and recategorize matches to "Transfers". Safe to re-run.
 *
 *   POST /api/maintenance/reclassify
 */
export async function POST() {
  const [transfersCat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, "Transfers"))
    .limit(1);

  if (!transfersCat) {
    return NextResponse.json(
      { error: "Transfers category missing - run npm run db:seed" },
      { status: 400 }
    );
  }

  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      remittance: transactions.remittance,
      merchant: transactions.merchant,
    })
    .from(transactions);

  const toUpdate = rows.filter((r) => isSelfTransfer(r)).map((r) => r.id);

  const CHUNK = 500;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const ids = toUpdate.slice(i, i + CHUNK);
    await db
      .update(transactions)
      .set({ categoryId: transfersCat.id, categorySource: "rule" })
      .where(inArray(transactions.id, ids));
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    reclassified: toUpdate.length,
  });
}