import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { apiRoute } from "@/server/http/handler";
import { startConnect } from "@/server/oauth/service";
import { RATE_LIMITS } from "@/server/rate-limit";

/** POST /api/v1/social-accounts/:platform/connect → { url } to the official OAuth consent screen. */
export const POST = apiRoute<{ key: string }>({ role: "admin", rateLimit: RATE_LIMITS.oauth }, async ({ req, params, user, workspace }) => {
  const platform = z.enum(PLATFORMS).parse(params.key);
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? undefined;
  const url = await startConnect({ workspaceId: workspace.id, userId: user.id, platform, returnTo });
  return { url };
});
