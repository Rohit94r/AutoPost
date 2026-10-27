import { z } from "zod";
import { readMedia } from "@/server/autofill/service";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

// Reading continues after the response (cron mode).
export const maxDuration = 300;

/** Start reading an attached photo so the post can be written from it. Returns { documentId } to poll. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const { mediaId } = await parseJson(req, z.object({ mediaId: z.string().uuid() }));
  return readMedia({ workspaceId: workspace.id, userId: user.id, correlationId, req }, mediaId);
});
