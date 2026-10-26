import { deleteDocument, getDocument } from "@/server/documents/service";
import { apiRoute, uuidParam } from "@/server/http/handler";

type P = { id: string };

export const GET = apiRoute<P>({}, async ({ params, workspace }) => ({ document: await getDocument(workspace.id, uuidParam(params.id)) }));

export const DELETE = apiRoute<P>({}, async ({ req, params, user, workspace }) => {
  await deleteDocument({ workspaceId: workspace.id, userId: user.id, documentId: uuidParam(params.id), req });
  return { ok: true };
});
