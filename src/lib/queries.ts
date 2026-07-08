import { db } from "@/db";
import { accounts, bankSessions, transactions, categories } from "@/db/schema";
import { and, desc, eq, gte, inArray, ilike, lte, or, sql, type SQL } from "drizzle-orm";

export async function getAccounts() {
  // Only return accounts from the most-recent session per ASPSP so re-linking
  // doesn't show stale duplicates on the dashboard.
  const allSessions = await db
    .select({
      sessionId: bankSessions.sessionId,
      aspspName: bankSessions.aspspName,
      aspspCountry: bankSessions.aspspCountry,
    })
    .from(bankSessions)
    .orderBy(bankSessions.createdAt); // ascending — last write per key wins

  const latestByAspsp = new Map<string, string>();
  for (const s of allSessions) {
    latestByAspsp.set(`${s.aspspName}:${s.aspspCountry}`, s.sessionId);
  }
  const activeSessionIds = [...latestByAspsp.values()];

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
    .where(
      activeSessionIds.length > 0
        ? inArray(accounts.sessionId, activeSessionIds)
        : undefined
    )
    .orderBy(accounts.createdAt);
}

export async function getCategories() {
  return db.select().from(categories).orderBy(categories.sort);
}

export interface TxFilter {
  limit?: number;
  month?: string;       // YYYY-MM
  categoryId?: number;
  accountUid?: string;
  q?: string;           // text search: counterpartyName | remittance | merchant
  minAmount?: number;   // absolute kr
  maxAmount?: number;   // absolute kr
}

export async function listTransactions(f: TxFilter = {}) {
  const conds: SQL[] = [];

  if (f.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(f.month);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const from = new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10);
      const to   = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      conds.push(gte(transactions.bookingDate, from));
      conds.push(lte(transactions.bookingDate, to));
    }
  }
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.accountUid) conds.push(eq(transactions.accountUid, f.accountUid));

  if (f.q?.trim()) {
    const pat = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(transactions.counterpartyName, pat),
        ilike(transactions.remittance, pat),
        ilike(transactions.merchant, pat)
      )!
    );
  }
  if (f.minAmount != null) {
    conds.push(sql`${transactions.amount}::float >= ${f.minAmount}`);
  }
  if (f.maxAmount != null) {
    conds.push(sql`${transactions.amount}::float <= ${f.maxAmount}`);
  }

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: transactions.id,
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
      flaggedReason: transactions.flaggedReason,
      recurring: sql<number>`(exists (select 1 from recurring_payments where recurring_payments.active = true and recurring_payments.merchant = ${transactions.merchant}))::int`,
    })
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(f.limit ?? 100);

  // Compute totals over the full filtered set.
  const [totals] = await db
    .select({
      totalIn:  sql<number>`coalesce(sum(case when ${transactions.direction}='CRDT' and not exists (select 1 from categories _c where _c.id = ${transactions.categoryId} and _c.name = 'Transfers') then ${transactions.amount}::float else 0 end),0)::float`,
      totalOut: sql<number>`coalesce(sum(case when ${transactions.direction}='DBIT' and not exists (select 1 from categories _c where _c.id = ${transactions.categoryId} and _c.name = 'Transfers') then ${transactions.amount}::float else 0 end),0)::float`,
      count:    sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(where);

  // Coerce the exists()::int to a real boolean (the neon-http server path can
  // otherwise hand back a truthy string for every row).
  const mapped = rows.map((r) => ({ ...r, recurring: Number(r.recurring) === 1 }));
  return { rows: mapped, totals };
}
