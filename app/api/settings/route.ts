import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getHourlyRate } from "@/lib/game/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Effective hourly rate (manual or salary-derived) for the config UI.
export async function GET() {
  const hr = await getHourlyRate();
  return NextResponse.json(hr);
}

// Update the manual hourly rate. Pass null / "" to clear (falls back to derived).
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { hourlyRate?: string | number | null };
  const cleared = body.hourlyRate == null || body.hourlyRate === "";
  const value = cleared ? null : String(Number(body.hourlyRate));

  if (!cleared && (Number.isNaN(Number(value)) || Number(value) <= 0)) {
    return NextResponse.json({ error: "hourlyRate must be > 0" }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({ key: "singleton", hourlyRate: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { hourlyRate: value, updatedAt: new Date() },
    });

  const hr = await getHourlyRate();
  return NextResponse.json(hr);
}
