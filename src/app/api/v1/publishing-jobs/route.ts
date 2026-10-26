import { apiRoute, parseJson, parseQuery } from "@/server/http/handler";
import { withIdempotency } from "@/server/http/idempotency";
import { createJobsInput, createPublishingJobs, listJobs, listJobsQuery } from "@/server/publishing/service";
import { RATE_LIMITS } from "@/server/rate-limit";

export const GET = apiRoute({}, async ({ req, workspace }) => listJobs(workspace.id, parseQuery(req, listJobsQuery)));

/** Publish now / schedule. Send an Idempotency-Key header to make retries and double-clicks safe. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.publish }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, createJobsInput);
  return withIdempotency(req, workspace.id, "publishing-jobs:create", input, async () => ({
    status: 201,
    body: await createPublishingJobs({ workspaceId: workspace.id, userId: user.id, correlationId, req }, input),
  }));
});
