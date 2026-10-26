import { contentPatch, deleteOrArchiveContent, getContent, updateContent } from "@/server/content/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

type P = { id: string };

export const GET = apiRoute<P>({}, async ({ params, workspace }) => ({ content: await getContent(workspace.id, uuidParam(params.id)) }));

export const PATCH = apiRoute<P>({}, async ({ req, params, user, workspace }) => {
  const id = uuidParam(params.id);
  await updateContent({ workspaceId: workspace.id, userId: user.id }, id, await parseJson(req, contentPatch));
  return { content: await getContent(workspace.id, id) };
});

export const DELETE = apiRoute<P>({}, async ({ req, params, user, workspace }) =>
  deleteOrArchiveContent({ workspaceId: workspace.id, userId: user.id, req }, uuidParam(params.id)),
);
