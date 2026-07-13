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

// Update a category — primarily its monthly/weekly budget.
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: number;
    budgetMonthly?: string | number | null;
    budgetWeekly?: string | number | null;
    name?: string;
    color?: string;
    discretionary?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const set: Record<string, unknown> = {};
  if (body.budgetMonthly !== undefined) {
    const cleared = body.budgetMonthly === null || body.budgetMonthly === "";
    set.budgetMonthly = cleared ? null : String(body.budgetMonthly);
    // A manual budget edit stamps the source so AI recalibration won't overwrite
    // it. Clearing the budget hands control back to the AI.
    set.budgetSource = cleared ? null : "manual";
  }
  if (body.budgetWeekly !== undefined) {
    const cleared = body.budgetWeekly === null || body.budgetWeekly === "";
    set.budgetWeekly = cleared ? null : String(body.budgetWeekly);
    if (set.budgetSource === undefined && !cleared) set.budgetSource = "manual";
  }
  if (body.name !== undefined) set.name = body.name;
  if (body.color !== undefined) set.color = body.color;
  if (body.discretionary !== undefined) set.discretionary = body.discretionary;

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
    color?: string;
    budgetMonthly?: string | number | null;
    budgetWeekly?: string | number | null;
    sort?: number;
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const [created] = await db
    .insert(categories)
    .values({
      name: body.name,
      color: body.color ?? "#6f926f",
      budgetMonthly:
        body.budgetMonthly == null || body.budgetMonthly === ""
          ? null
          : String(body.budgetMonthly),
      budgetWeekly:
        body.budgetWeekly == null || body.budgetWeekly === ""
          ? null
          : String(body.budgetWeekly),
      sort: body.sort ?? 100,
    })
    .returning();

  return NextResponse.json({ category: created }, { status: 201 });
}

// Core categories the app depends on (period detection, transfer/savings logic,
// and the categorization fallback). These cannot be deleted.
const UNDELETABLE = new Set(["Uncategorized", "Income", "Transfers", "Savings"]);

// Delete a category. Transactions referencing it fall back to NULL (FK is
// ON DELETE SET NULL), so history is preserved — the rows just become
// uncategorized until re-run.
export async function DELETE(req: NextRequest) {
  const idParam = new URL(req.url).searchParams.get("id");
  const id = idParam ? Number(idParam) : NaN;
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (UNDELETABLE.has(existing.name)) {
    return NextResponse.json(
      { error: `"${existing.name}" is a core category and can't be deleted` },
      { status: 400 }
    );
  }

  await db.delete(categories).where(eq(categories.id, id));
  return NextResponse.json({ ok: true });
}