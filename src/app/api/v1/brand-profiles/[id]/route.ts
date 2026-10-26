import { brandInput, deleteBrand, saveBrand } from "@/server/brand/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

type P = { id: string };

export const PATCH = apiRoute<P>({}, async ({ req, params, workspace }) => ({
  profile: await saveBrand(workspace.id, await parseJson(req, brandInput), uuidParam(params.id)),
}));

export const DELETE = apiRoute<P>({}, async ({ params, workspace }) => {
  await deleteBrand(workspace.id, uuidParam(params.id));
  return { ok: true };
});
