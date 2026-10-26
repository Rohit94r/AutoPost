import { z } from "zod";
import { setItemStatus } from "@/server/engagement/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

export const PATCH = apiRoute<{ id: string }>({}, async ({ req, params, workspace }) => {
  const { status } = await parseJson(req, z.object({ status: z.enum(["new", "needs_review", "ignored"]) }));
  await setItemStatus(workspace.id, uuidParam(params.id), status);
  return { ok: true };
});
