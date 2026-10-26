import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { suggestHashtags } from "@/server/ai/content-generator";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = z.object({ text: z.string().trim().min(1).max(8000), platform: z.enum(PLATFORMS), count: z.number().int().min(1).max(30).default(5) });

export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  return suggestHashtags({ workspaceId: workspace.id, userId: user.id, correlationId }, input);
});
