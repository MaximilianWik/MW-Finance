import { db } from "@/db";
import { transactions, categories, reflections } from "@/db/schema";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

export type Verdict = "glad" | "regret" | "meh";
export const VERDICTS: Verdict[] = ["glad", "regret", "meh"];

export interface PendingReflection {
  id: number;
  displayName: string;
  signed: number;
  bookingDate: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

/** Days back to prompt for reflection on. */
const WINDOW_DAYS = 14;

/**
 * Recent discretionary outflows the user hasn't reflected on yet.
 * These drive the "[ PENDING REFLECTIONS ]" overview panel.
 */
export async function getPendingReflections(limit = 6): Promise<PendingReflection[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      id: transactions.id,
      signed: sql<number>`${transactions.signed}::float`,
      bookingDate: transactions.bookingDate,
      counterpartyName: transactions.counterpartyName,
      remittance: transactions.remittance,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(reflections, eq(reflections.transactionId, transactions.id))
    .where(
      and(
        eq(categories.discretionary, true),
        eq(transactions.direction, "DBIT"),
        gte(transactions.bookingDate, since),
        isNull(reflections.transactionId)
      )
    )
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    signed: r.signed,
    bookingDate: r.bookingDate,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
    displayName: r.counterpartyName ?? r.remittance ?? "\u2014",
  }));
}

/** Persist a verdict for a transaction (re-answering overwrites). */
export async function saveReflection(transactionId: number, verdict: Verdict) {
  await db
    .insert(reflections)
    .values({ transactionId, verdict })
    .onConflictDoUpdate({
      target: reflections.transactionId,
      set: { verdict, createdAt: new Date() },
    });
}
