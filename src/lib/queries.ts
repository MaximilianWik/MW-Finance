import { db } from "@/db";
import { accounts, bankSessions, categories } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";

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
