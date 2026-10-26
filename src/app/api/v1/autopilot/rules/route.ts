import { NextResponse } from "next/server";
import { listRules, ruleInput, saveRule } from "@/server/engagement/service";
import { apiRoute, parseJson } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ workspace }) => ({ rules: await listRules(workspace.id) }));

export const POST = apiRoute({ role: "admin" }, async ({ req, user, workspace }) => {
  const rule = await saveRule({ workspaceId: workspace.id, userId: user.id }, await parseJson(req, ruleInput));
  return NextResponse.json({ rule }, { status: 201 });
});
