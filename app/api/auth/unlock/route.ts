import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { password } → validates against SITE_PASSWORD env var,
 * sets an httpOnly session cookie (30 days) and returns { ok: true }.
 * If SITE_PASSWORD is not configured, any password unlocks the app.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { password?: string };
  const expected = process.env.SITE_PASSWORD ?? "";

  if (expected && body.password !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  // Sign a 30-day JWT with the password as the HMAC key.
  const secret = new TextEncoder().encode(expected || "mwfinance-dev");
  const token = await new SignJWT({ sub: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("mwf_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
