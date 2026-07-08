import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiInsights } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List current (non-dismissed) AI insights, newest first. */
export async function GET() {
  const rows = await db
    .select({
      id: aiInsights.id,
      kind: aiInsights.kind,
      severity: aiInsights.severity,
      title: aiInsights.title,
      body: aiInsights.body,
      categoryId: aiInsights.categoryId,
      createdAt: aiInsights.createdAt,
    })
    .from(aiInsights)
    .where(eq(aiInsights.dismissed, false))
    .orderBy(desc(aiInsights.createdAt), desc(aiInsights.id));
  return NextResponse.json({ insights: rows });
}

/** Dismiss an insight (soft — kept in the table so analysis won't re-surface it). */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [updated] = await db
    .update(aiInsights)
    .set({ dismissed: true })
    .where(eq(aiInsights.id, body.id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
