import { z } from "zod";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { retryJob } from "@/server/publishing/service";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = z.object({ confirmNotPublished: z.boolean().default(false) });

export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.publish }, async ({ req, params, user, workspace, correlationId }) => {
  const input = await parseJson(req, body).catch(() => ({ confirmNotPublished: false }));
  return { job: await retryJob({ workspaceId: workspace.id, userId: user.id, correlationId }, uuidParam(params.id), input) };
});

// Publishing / extraction may continue after the response (cron mode); allow the full function time.
export const maxDuration = 300;
