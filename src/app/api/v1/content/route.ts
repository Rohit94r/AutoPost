import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { contentInput, createContent, listContent, listQuery } from "@/server/content/service";
import { apiRoute, parseJson, parseQuery } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ req, workspace }) => listContent(workspace.id, parseQuery(req, listQuery)));

export const POST = apiRoute({}, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, contentInput);
  const row = await createContent({ workspaceId: workspace.id, userId: user.id }, input);
  await audit({ workspaceId: workspace.id, actorUserId: user.id, action: "content.created", targetType: "content", targetId: row.id, req, correlationId });
  return NextResponse.json({ content: row }, { status: 201 });
});
