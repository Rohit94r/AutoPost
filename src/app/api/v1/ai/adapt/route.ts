import { z } from "zod";
import { platformListSchema } from "@/lib/writing";
import { adaptToPlatforms } from "@/server/ai/content-generator";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = aiBase.extend({ text: z.string().trim().min(1).max(8000), platforms: platformListSchema });

export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  const { controls, voice } = await resolveVoice(workspace.id, input);
  return adaptToPlatforms({ workspaceId: workspace.id, userId: user.id, correlationId, contentId: input.contentId }, { text: input.text, platforms: input.platforms, controls, voice });
});
