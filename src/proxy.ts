import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route guard: bounce visitors without a session cookie away from app pages.
 * Real authorization happens server-side on every page and API call (requirePageContext /
 * apiRoute); this only avoids rendering protected shells for signed-out users.
 */
const APP_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/accounts",
  "/compose",
  "/studio",
  "/documents",
  "/library",
  "/calendar",
  "/queue",
  "/history",
  "/analytics",
  "/brand",
  "/settings",
  "/admin",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(getSessionCookie(req, { cookiePrefix: "verdant" }));
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !hasSession) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/sign-in" || pathname === "/sign-up") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // API routes are excluded so request bodies (uploads) are never buffered by the proxy.
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico).*)"],
};
