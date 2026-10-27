import { apiRoute, uuidParam } from "@/server/http/handler";
import { retryFailedForContent } from "@/server/publishing/service";
import { RATE_LIMITS } from "@/server/rate-limit";

export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.publish }, async ({ params, user, workspace, correlationId }) =>
  retryFailedForContent({ workspaceId: workspace.id, userId: user.id, correlationId }, uuidParam(params.id)),
);

// Publishing / extraction may continue after the response (cron mode); allow the full function time.
export const maxDuration = 300;
