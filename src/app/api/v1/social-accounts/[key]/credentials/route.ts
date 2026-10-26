import { NextResponse } from "next/server";
import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { AppError } from "@/server/errors";
import { apiRoute, parseJson } from "@/server/http/handler";
import { connectWithCredentials } from "@/server/oauth/service";
import { PlatformError } from "@/server/platforms/types";
import { RATE_LIMITS } from "@/server/rate-limit";

/**
 * POST /api/v1/social-accounts/:platform/credentials — connect a credential-based platform
 * (Bluesky app password, Mastodon token, Telegram bot, Discord webhook, WordPress, webhook).
 * Credentials are validated against the platform, then stored encrypted; they never come back.
 */
export const POST = apiRoute<{ key: string }>({ role: "admin", rateLimit: RATE_LIMITS.oauth }, async ({ req, params, user, workspace, correlationId }) => {
  const platform = z.enum(PLATFORMS).parse(params.key);
  const { values } = await parseJson(req, z.object({ values: z.record(z.string(), z.string().max(4000)) }));
  try {
    const accounts = await connectWithCredentials({ workspaceId: workspace.id, userId: user.id, platform, values, req, correlationId });
    return NextResponse.json({ accounts }, { status: 201 });
  } catch (err) {
    if (err instanceof PlatformError) throw new AppError(err.kind === "transient" ? 502 : 400, `platform_${err.kind}`, err.message);
    throw err;
  }
});
