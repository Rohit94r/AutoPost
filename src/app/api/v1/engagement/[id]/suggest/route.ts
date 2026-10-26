import { suggestReply } from "@/server/engagement/service";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

/** AI-drafted reply for review. Nothing is posted. */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.ai }, async ({ params, user, workspace, correlationId }) =>
  suggestReply({ workspaceId: workspace.id, userId: user.id, correlationId }, uuidParam(params.id)),
);
