import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Site-wide lock screen. Every request (any page, any API route, any
 * method) must carry a valid mwf_session cookie, except:
 *   - a handful of public static/SEO files that reveal no financial data
 *     (icons, manifest, service worker, sitemap, the lock screen itself)
 *   - /api/auth/* and /api/callback — the unlock endpoint and the bank
 *     OAuth dance, whose cross-site redirect back to us can't carry a
 *     SameSite=strict cookie
 *   - Bearer-authenticated cron requests (each route verifies its own secret)
 *
 * Page requests without a valid session are redirected to /unlock.
 * Everything else without a valid session gets a 401 JSON response.
 *
 * Set SITE_PASSWORD in your environment to enable protection.
 * If SITE_PASSWORD is not set, everything is open (dev mode).
 */

const PUBLIC_PATHS = new Set([
  "/unlock",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg",
  "/opengraph-image",
  "/sitemap.xml",
  "/google251be8f6066ae277.html",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

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
  let authed = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(password));
      authed = true;
    } catch {
      authed = false;
    }
  }

  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const unlockUrl = new URL("/unlock", req.url);
  unlockUrl.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(unlockUrl);
}

export const config = {
  // Run on everything except Next.js internal static/image asset serving.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
