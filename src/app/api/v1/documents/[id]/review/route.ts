import { reviewExtraction, reviewInput } from "@/server/documents/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

export const PUT = apiRoute<{ id: string }>({}, async ({ req, params, user, workspace }) =>
  reviewExtraction({ workspaceId: workspace.id, userId: user.id, documentId: uuidParam(params.id), review: await parseJson(req, reviewInput) }),
);
