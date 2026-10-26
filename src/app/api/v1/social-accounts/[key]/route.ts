import { apiRoute, uuidParam } from "@/server/http/handler";
import { disconnectAccount } from "@/server/oauth/service";

/** DELETE /api/v1/social-accounts/:id — disconnect (revoke where supported, delete tokens). */
export const DELETE = apiRoute<{ key: string }>({ role: "admin" }, async ({ req, params, user, workspace, correlationId }) =>
  disconnectAccount({ workspaceId: workspace.id, accountId: uuidParam(params.key), userId: user.id, req, correlationId }),
);
