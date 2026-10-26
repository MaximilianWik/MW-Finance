import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goalAccounts, savingsGoals } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getInvestmentAccounts } from "@/lib/investments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Investment accounts that fund a goal.
 *   GET → every account with this goal's share and the share used elsewhere.
 *   PUT { links: [{ accountId, sharePct }] } → replaces this goal's links.
 * One account's shares across all goals may not exceed 100%.
 */

async function goalExists(id: number) {
  const [g] = await db.select({ id: savingsGoals.id }).from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1);
  return !!g;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const goalId = Number((await params).id);
  if (!Number.isFinite(goalId) || !(await goalExists(goalId))) {
    return NextResponse.json({ error: "goal not found" }, { status: 404 });
  }
  const [{ accounts }, links] = await Promise.all([
    getInvestmentAccounts(),
    db
      .select({
        goalId: goalAccounts.goalId,
        accountId: goalAccounts.accountId,
        sharePct: sql<number>`${goalAccounts.sharePct}::float`,
      })
      .from(goalAccounts),
  ]);
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      balance: a.currentBalance,
      sharePct: links.find((l) => l.goalId === goalId && l.accountId === a.id)?.sharePct ?? 0,
      usedElsewhere: links
        .filter((l) => l.goalId !== goalId && l.accountId === a.id)
        .reduce((s, l) => s + l.sharePct, 0),
    })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const goalId = Number((await params).id);
  if (!Number.isFinite(goalId) || !(await goalExists(goalId))) {
    return NextResponse.json({ error: "goal not found" }, { status: 404 });
  }
  const body = (await req.json()) as { links?: Array<{ accountId: number; sharePct: number }> };
  const links = (body.links ?? [])
    .map((l) => ({ accountId: Number(l.accountId), sharePct: Math.round(Number(l.sharePct) * 100) / 100 }))
    .filter((l) => Number.isFinite(l.accountId) && l.sharePct > 0);

  if (links.some((l) => l.sharePct > 100)) {
    return NextResponse.json({ error: "a share can't be above 100%" }, { status: 400 });
  }

  // Shares this account already gives to other goals.
  for (const l of links) {
    const [other] = await db
      .select({ used: sql<number>`coalesce(sum(${goalAccounts.sharePct}::float), 0)::float` })
      .from(goalAccounts)
      .where(and(eq(goalAccounts.accountId, l.accountId), ne(goalAccounts.goalId, goalId)));
    const used = other?.used ?? 0;
    if (used + l.sharePct > 100) {
      return NextResponse.json(
        { error: `account ${l.accountId}: ${used}% already funds other goals, max ${100 - used}% left` },
        { status: 409 }
      );
    }
  }

  await db.delete(goalAccounts).where(eq(goalAccounts.goalId, goalId));
  if (links.length) {
    await db.insert(goalAccounts).values(
      links.map((l) => ({ goalId, accountId: l.accountId, sharePct: l.sharePct.toFixed(2) }))
    );
  }
  return NextResponse.json({ ok: true, links });
}
