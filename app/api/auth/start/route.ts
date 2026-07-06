import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { startAuth } from "@/lib/enablebanking/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = crypto.randomUUID();
  const c = await cookies();
  c.set("eb_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 900,
    path: "/",
  });

  try {
    const { url } = await startAuth(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
