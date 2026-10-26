import { z } from "zod";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { rescheduleJob } from "@/server/publishing/service";

const body = z.object({ scheduledAtLocal: z.string(), timezone: z.string().max(64) });

export const POST = apiRoute<{ id: string }>({}, async ({ req, params, user, workspace, correlationId }) => ({
  job: await rescheduleJob({ workspaceId: workspace.id, userId: user.id, correlationId }, uuidParam(params.id), await parseJson(req, body)),
}));
