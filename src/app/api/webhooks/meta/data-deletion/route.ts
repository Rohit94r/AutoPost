import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { handleInstagramDataDeletion } from "@/server/meta/service";
import { parseSignedRequest } from "@/server/meta/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Data deletion request URL". Must respond with a status URL and a confirmation code
 * (https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback).
 */
export async function POST(req: Request) {
  const e = env();
  if (!e.INSTAGRAM_APP_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const signed = form?.get("signed_request");
  const payload = typeof signed === "string" ? parseSignedRequest(signed, e.INSTAGRAM_APP_SECRET) : null;
  if (!payload?.user_id) return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  const { code, deleted } = await handleInstagramDataDeletion(String(payload.user_id));
  logger.info({ deleted }, "instagram data deletion callback handled");
  return NextResponse.json({ url: `${e.APP_BASE_URL}/data-deletion?code=${code}`, confirmation_code: code });
}
