import { db } from "@/db";
import { accounts, transactions, categories } from "@/db/schema";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

export async function getAccounts() {
  return db
    .select({
      uid: accounts.uid,
      name: accounts.name,
      iban: accounts.iban,
      currency: accounts.currency,
      product: accounts.product,
      aspspName: accounts.aspspName,
      balance: sql<number | null>`${accounts.balance}::float`,
      balanceUpdatedAt: accounts.balanceUpdatedAt,
    })
    .from(accounts)
    .orderBy(accounts.createdAt);
}

export async function getCategories() {
  return db.select().from(categories).orderBy(categories.sort);
}

export interface TxFilter {
  limit?: number;
  month?: string; // YYYY-MM
  categoryId?: number;
  accountUid?: string;
}

export async function listTransactions(f: TxFilter = {}) {
  const conds: SQL[] = [];
  if (f.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(f.month);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const from = new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10);
      const to = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      conds.push(gte(transactions.bookingDate, from));
      conds.push(lte(transactions.bookingDate, to));
    }
  }
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.accountUid) conds.push(eq(transactions.accountUid, f.accountUid));

  return db
    .select({
      id: transactions.id,
      direction: transactions.direction,
      amount: sql<number>`${transactions.amount}::float`,
      signed: sql<number>`${transactions.signed}::float`,
      currency: transactions.currency,
      bookingDate: transactions.bookingDate,
      counterpartyName: transactions.counterpartyName,
      remittance: transactions.remittance,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      flaggedReason: transactions.flaggedReason,
    })
    .from(transactions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(f.limit ?? 100);
}
