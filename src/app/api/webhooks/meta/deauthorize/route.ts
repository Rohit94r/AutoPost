import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { handleInstagramDeauthorize } from "@/server/meta/service";
import { parseSignedRequest } from "@/server/meta/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Deauthorize callback URL". Called by Meta (server-to-server) when a user removes the app.
 * Authenticated by the HMAC-signed `signed_request`, not by session or Origin.
 */
export async function POST(req: Request) {
  const secret = env().INSTAGRAM_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload = typeof signed === "string" ? parseSignedRequest(signed, secret) : null;
  if (!payload?.user_id) return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  const n = await handleInstagramDeauthorize(String(payload.user_id));
  logger.info({ accounts: n }, "instagram deauthorize callback handled");
  return NextResponse.json({ success: true });
}
