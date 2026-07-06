import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sort));
  return NextResponse.json({ categories: rows });
}

// Update a category — primarily its monthly budget.
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: number;
    budgetMonthly?: string | number | null;
    name?: string;
    emoji?: string;
    color?: string;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const set: Record<string, unknown> = {};
  if (body.budgetMonthly !== undefined) {
    set.budgetMonthly =
      body.budgetMonthly === null || body.budgetMonthly === ""
        ? null
        : String(body.budgetMonthly);
  }
  if (body.name !== undefined) set.name = body.name;
  if (body.emoji !== undefined) set.emoji = body.emoji;
  if (body.color !== undefined) set.color = body.color;

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(categories)
    .set(set)
    .where(eq(categories.id, body.id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ category: updated });
}

// Create a new category.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    emoji?: string;
    color?: string;
    budgetMonthly?: string | number | null;
    sort?: number;
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const [created] = await db
    .insert(categories)
    .values({
      name: body.name,
      emoji: body.emoji ?? "💸",
      color: body.color ?? "#8a97a6",
      budgetMonthly:
        body.budgetMonthly == null || body.budgetMonthly === ""
          ? null
          : String(body.budgetMonthly),
      sort: body.sort ?? 100,
    })
    .returning();

  return NextResponse.json({ category: created }, { status: 201 });
}
