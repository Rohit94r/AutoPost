import { requestExtraction } from "@/server/documents/service";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";
import { assertQuota } from "@/server/usage/service";

/** Re-run extraction (e.g. after a failure). */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.ai }, async ({ params, user, workspace, correlationId }) => {
  await assertQuota(workspace.id, "document");
  return requestExtraction({ workspaceId: workspace.id, userId: user.id, documentId: uuidParam(params.id), correlationId });
});

// Publishing / extraction may continue after the response (cron mode); allow the full function time.
export const maxDuration = 300;
