import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { REWRITE_OPS } from "@/lib/writing";
import { rewriteText } from "@/server/ai/content-generator";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = aiBase.extend({
  text: z.string().trim().min(1).max(8000),
  operation: z.enum(REWRITE_OPS),
  platform: z.enum(PLATFORMS).optional(),
});

/** Returns before/after for review — the original is never overwritten server-side. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  const { controls, voice } = await resolveVoice(workspace.id, input);
  return rewriteText({ workspaceId: workspace.id, userId: user.id, correlationId, contentId: input.contentId }, { text: input.text, operation: input.operation, platform: input.platform, controls, voice });
});
