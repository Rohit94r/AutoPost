import { z } from "zod";
import { replyToItem } from "@/server/engagement/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

/** Post a reply on the platform, right now, from the web inbox. */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.publish }, async ({ req, params, user, workspace }) => {
  const { text } = await parseJson(req, z.object({ text: z.string().trim().min(1).max(10_000) }));
  return replyToItem({ workspaceId: workspace.id, userId: user.id, req }, uuidParam(params.id), text);
});
