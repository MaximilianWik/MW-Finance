import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual trigger from the dashboard UI. No secret required — this is a
// personal app and the endpoint only pulls + processes your own bank data.
export async function POST() {
  const result = await runSync({ useGemini: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
