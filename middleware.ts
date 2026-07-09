import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const MUTATING = new Set(["POST", "PATCH", "DELETE", "PUT"]);

/**
 * Guards all mutating API requests (/api/* POST/PATCH/DELETE) behind a
 * session cookie. Read-only GETs, OAuth flows (/api/auth/*), and
 * Bearer-authenticated cron requests pass through freely.
 *
 * Set SITE_PASSWORD in your environment to enable protection.
 * If SITE_PASSWORD is not set, all mutations are allowed (dev mode).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Only guard API routes with mutating methods.
  if (!MUTATING.has(method)) return NextResponse.next();

  // Pass through auth endpoints (OAuth start/callback + our unlock route).
  if (pathname.startsWith("/api/auth/") || pathname === "/api/callback") {
    return NextResponse.next();
  }

  // Pass through Bearer-authenticated cron requests (each route verifies its own secret).
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) return NextResponse.next();

  // No password configured → dev/open mode, allow everything.
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  // Verify session cookie.
  const token = req.cookies.get("mwf_session")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(password));
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

export const config = {
  // Only run on API routes — pages never hit this middleware.
  matcher: "/api/:path*",
};
