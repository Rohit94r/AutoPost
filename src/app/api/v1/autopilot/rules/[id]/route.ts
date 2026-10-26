import { deleteRule, ruleInput, saveRule } from "@/server/engagement/service";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

type P = { id: string };

export const PATCH = apiRoute<P>({ role: "admin" }, async ({ req, params, user, workspace }) => ({
  rule: await saveRule({ workspaceId: workspace.id, userId: user.id }, await parseJson(req, ruleInput), uuidParam(params.id)),
}));

export const DELETE = apiRoute<P>({ role: "admin" }, async ({ params, workspace }) => {
  await deleteRule(workspace.id, uuidParam(params.id));
  return { ok: true };
});
