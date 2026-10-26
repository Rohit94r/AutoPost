import { unarchiveContent } from "@/server/content/service";
import { apiRoute, uuidParam } from "@/server/http/handler";

export const POST = apiRoute<{ id: string }>({}, async ({ params, workspace }) => {
  await unarchiveContent(workspace.id, uuidParam(params.id));
  return { ok: true };
});
