import { apiRoute, uuidParam } from "@/server/http/handler";
import { cancelJob } from "@/server/publishing/service";

export const POST = apiRoute<{ id: string }>({}, async ({ req, params, user, workspace }) => ({
  job: await cancelJob({ workspaceId: workspace.id, userId: user.id, req }, uuidParam(params.id)),
}));
