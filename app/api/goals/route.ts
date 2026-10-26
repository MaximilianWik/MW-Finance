import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { savingsGoals, goalAccounts } from "@/db/schema";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { getGoals } from "@/lib/savings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await getGoals();
  return NextResponse.json({ goals });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    targetAmount?: number | string;
    targetDate?: string | null;
    isPrimary?: boolean;
    accounts?: Array<{ accountId: number; sharePct?: number }>; // investment accounts that fund it
  };
  if (!body.name || body.targetAmount == null) {
    return NextResponse.json({ error: "name and targetAmount required" }, { status: 400 });
  }
  const target = String(body.targetAmount);
  const [created] = await db
    .insert(savingsGoals)
    .values({
      name: body.name,
      targetAmount: target,
      targetDate: body.targetDate ?? null,
      isPrimary: !!body.isPrimary,
    })
    .returning();

  // If this is the new primary, unflag every other goal.
  if (created?.isPrimary) {
    await db
      .update(savingsGoals)
      .set({ isPrimary: false })
      .where(and(eq(savingsGoals.isPrimary, true), ne(savingsGoals.id, created.id)));
  }

  // Link funding accounts: asked share (default 100%), capped at what other
  // goals leave free on that account. Fully used accounts are skipped.
  const wanted = (body.accounts ?? []).filter((a) => Number.isFinite(Number(a.accountId)));
  if (created && wanted.length) {
    const used = await db
      .select({
        accountId: goalAccounts.accountId,
        used: sql<number>`sum(${goalAccounts.sharePct}::float)::float`,
      })
      .from(goalAccounts)
      .where(inArray(goalAccounts.accountId, wanted.map((a) => Number(a.accountId))))
      .groupBy(goalAccounts.accountId);
    const usedBy = new Map(used.map((u) => [u.accountId, u.used]));
    const rows = wanted
      .map((a) => {
        const free = 100 - (usedBy.get(Number(a.accountId)) ?? 0);
        const share = Math.min(free, Math.max(0, Number(a.sharePct ?? 100)));
        return { goalId: created.id, accountId: Number(a.accountId), sharePct: share.toFixed(2), share };
      })
      .filter((r) => r.share > 0)
      .map(({ share: _share, ...r }) => r);
    if (rows.length) await db.insert(goalAccounts).values(rows);
  }

  return NextResponse.json({ goal: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: number;
    name?: string;
    targetAmount?: number | string;
    targetDate?: string | null;
    isPrimary?: boolean;
    paused?: boolean;
    imageUrl?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const set: Record<string, unknown> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.targetAmount !== undefined) set.targetAmount = String(body.targetAmount);
  if (body.targetDate !== undefined) set.targetDate = body.targetDate;
  if (body.isPrimary !== undefined) set.isPrimary = body.isPrimary;
  if (body.paused !== undefined) set.paused = body.paused;
  if (body.imageUrl !== undefined) set.imageUrl = body.imageUrl;

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(savingsGoals)
    .set(set)
    .where(eq(savingsGoals.id, body.id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (updated.isPrimary) {
    await db
      .update(savingsGoals)
      .set({ isPrimary: false })
      .where(and(eq(savingsGoals.isPrimary, true), ne(savingsGoals.id, updated.id)));
  }

  return NextResponse.json({ goal: updated });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(savingsGoals).where(eq(savingsGoals.id, Number(id)));
  return NextResponse.json({ ok: true });
}
