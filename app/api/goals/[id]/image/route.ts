import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { savingsGoals } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a goal image to Vercel Blob and persist its URL. Frontend should
 * downscale to ≤1024px before uploading — we defensively cap at 5 MB.
 *
 * Requires BLOB_READ_WRITE_TOKEN in the environment.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const goalId = Number(id);

  const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
  if (!goal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (max 5MB)" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "must be an image" }, { status: 415 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const key = `goals/${goalId}-${Date.now()}.${ext}`;

  try {
    const blob = await put(key, file, { access: "public", addRandomSuffix: false });
    await db
      .update(savingsGoals)
      .set({ imageUrl: blob.url })
      .where(eq(savingsGoals.id, goalId));
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "upload failed — is BLOB_READ_WRITE_TOKEN set?",
      },
      { status: 500 }
    );
  }
}
