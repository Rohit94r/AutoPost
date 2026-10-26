import { NextResponse, type NextRequest } from "next/server";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { getSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { completeConnect, oauthErrorMessage } from "@/server/oauth/service";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Top-level navigation from the platform, so it is authenticated by the
 * session cookie and the single-use `state` (bound to this user + platform), not by Origin.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const base = env().APP_BASE_URL;
  const back = (path: string, q: Record<string, string>) => {
    const u = new URL(path, base);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };
  if (!(PLATFORMS as readonly string[]).includes(key)) return back("/accounts", { error: "Unknown platform" });
  const platform = key as Platform;
  const session = await getSession();
  if (!session) return back("/sign-in", { error: "Sign in again to finish connecting your account." });

  const sp = req.nextUrl.searchParams;
  const denied = sp.get("error");
  if (denied) {
    const desc = sp.get("error_description") ?? sp.get("error_reason") ?? denied;
    return back("/accounts", { error: denied === "access_denied" || denied === "user_cancelled_authorize" ? "Connection cancelled." : `Connection failed: ${desc.slice(0, 200)}` });
  }
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return back("/accounts", { error: "Missing authorization code." });

  const correlationId = crypto.randomUUID();
  try {
    const result = await completeConnect({ platform, state, code: code.replace(/#_$/, ""), userId: session.user.id, req, correlationId });
    const limited = result.accounts.filter((a) => a.status !== "connected");
    return back(result.returnTo, {
      connected: String(result.accounts.length),
      platform,
      ...(limited.length ? { warning: limited.map((a) => `${a.displayName}: ${a.reason ?? a.status}`).join(" | ").slice(0, 400) } : {}),
    });
  } catch (err) {
    logger.warn({ err, platform, correlationId }, "oauth callback failed");
    return back("/accounts", { error: oauthErrorMessage(err) });
  }
}
