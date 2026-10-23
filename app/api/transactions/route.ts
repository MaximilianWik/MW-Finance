import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories, merchantCategories, savingsContributions, accounts } from "@/db/schema";
import { and, desc, eq, gte, lte, ilike, or, sql, type SQL } from "drizzle-orm";
import { salaryWhere } from "@/lib/period";

const BALANCE_MAX_AGE_MS = 2 * 86_400_000; // older balance → carried/left hidden

/**
 * Opening ("carried") and closing ("left") balance of the salary account for a
 * salary cycle. The bank only gives the CURRENT booked balance, so we work
 * backwards: carried = balance now − Σ signed booked rows since cycle start.
 * Returns nulls when the salary account, a fresh balance, or `from` is missing.
 */
async function cycleBalances(
  from: string,
  to: string | null
): Promise<{ carried: number | null; left: number | null }> {
  const none = { carried: null, left: null };

  const [salary] = await db
    .select({ accountUid: transactions.accountUid })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(salaryWhere(), eq(transactions.bookingDate, from)))
    .limit(1);
  if (!salary) return none;

  const [acc] = await db
    .select({ balance: sql<number | null>`${accounts.balance}::float`, updatedAt: accounts.balanceUpdatedAt })
    .from(accounts)
    .where(eq(accounts.uid, salary.accountUid))
    .limit(1);
  if (acc?.balance == null || !acc.updatedAt) return none;
  if (Date.now() - acc.updatedAt.getTime() > BALANCE_MAX_AGE_MS) return none;

  // Booked rows only: the stored balance is the booked (CLBD) balance.
  const booked = sql`${transactions.status} is distinct from 'PDNG'`;
  const [sums] = await db
    .select({
      sinceFrom: sql<number>`coalesce(sum(${transactions.signed}::float), 0)::float`,
      inCycle: to
        ? sql<number>`coalesce(sum(case when ${transactions.bookingDate} <= ${to} then ${transactions.signed}::float else 0 end), 0)::float`
        : sql<number>`0::float`,
    })
    .from(transactions)
    .where(and(eq(transactions.accountUid, salary.accountUid), gte(transactions.bookingDate, from), booked));

  const carried = acc.balance - sums.sinceFrom;
  const left = to ? carried + sums.inCycle : acc.balance;
  return { carried, left };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to   = new Date(Date.UTC(y, mo,     0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const sp  = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 200), 500);
  const conds: SQL[] = [];

  const month = sp.get("month");
  if (month) {
    const b = monthBounds(month);
    if (b) {
      conds.push(gte(transactions.bookingDate, b.from));
      conds.push(lte(transactions.bookingDate, b.to));
    }
  }

  // Explicit date range (used by the category drill-down). Additive to `month`.
  const from = sp.get("from");
  if (from) conds.push(gte(transactions.bookingDate, from));
  const to = sp.get("to");
  if (to) conds.push(lte(transactions.bookingDate, to));

  const categoryId = sp.get("categoryId");
  if (categoryId) conds.push(eq(transactions.categoryId, Number(categoryId)));

  const accountUid = sp.get("accountUid");
  if (accountUid) conds.push(eq(transactions.accountUid, accountUid));

  const q = sp.get("q")?.trim();
  if (q) {
    const pat = `%${q}%`;
    conds.push(
      or(
        ilike(transactions.counterpartyName, pat),
        ilike(transactions.remittance, pat),
        ilike(transactions.merchant, pat)
      )!
    );
  }

  const minAmount = sp.get("minAmount");
  if (minAmount) conds.push(sql`${transactions.amount}::float >= ${Number(minAmount)}`);

  const maxAmount = sp.get("maxAmount");
  if (maxAmount) conds.push(sql`${transactions.amount}::float <= ${Number(maxAmount)}`);

  const where = conds.length ? and(...conds) : undefined;

  const [rows, [totals]] = await Promise.all([
    db
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
        categoryName: categories.name,
        categoryColor: categories.color,
        recurring: sql<number>`(exists (select 1 from recurring_payments where recurring_payments.active = true and recurring_payments.merchant = ${transactions.merchant}))::int`,
        recurringVariable: sql<number>`coalesce((select variable_amount::int from recurring_payments where active = true and merchant = ${transactions.merchant} limit 1), 0)`,
        sweepContributionId: sql<number | null>`(select id from ${savingsContributions} where ${savingsContributions.transactionId} = ${transactions.id} limit 1)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.bookingDate), desc(transactions.id))
      .limit(limit),

    db
      .select({
        totalIn:  sql<number>`coalesce(sum(case when ${transactions.direction}='CRDT' and not exists (select 1 from categories _c where _c.id = ${transactions.categoryId} and _c.name = 'Transfers') then ${transactions.amount}::float else 0 end),0)::float`,
        totalOut: sql<number>`coalesce(sum(case when ${transactions.direction}='DBIT' and not exists (select 1 from categories _c where _c.id = ${transactions.categoryId} and _c.name = 'Transfers') then ${transactions.amount}::float else 0 end),0)::float`,
        count:    sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(where),
  ]);

  const transactionsOut = rows.map((r) => ({
    ...r,
    recurring: Number(r.recurring) === 1,
    recurringVariable: Number(r.recurringVariable) === 1,
    sweepContributionId: r.sweepContributionId ?? null,
  }));
  const tookMs = Math.round(performance.now() - t0);
  const balances =
    sp.get("cycle") === "1" && from ? await cycleBalances(from, to) : { carried: null, left: null };
  return NextResponse.json({ transactions: transactionsOut, totals: { ...totals, ...balances }, tookMs });
}

// Manual category override + merchant-cache update.
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

    // Propagate to every transaction sharing this merchant (past + future).
    await db
      .update(transactions)
      .set({ categoryId: body.categoryId, categorySource: "manual" })
      .where(eq(transactions.merchant, updated.merchant));
  }

  return NextResponse.json({ ok: true });
}
