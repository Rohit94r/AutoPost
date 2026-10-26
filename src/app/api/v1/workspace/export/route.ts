import { NextResponse } from "next/server";
import { exportWorkspace } from "@/server/account/service";
import { audit } from "@/server/audit";
import { apiRoute } from "@/server/http/handler";

export const GET = apiRoute({ role: "admin" }, async ({ req, user, workspace, correlationId }) => {
  const data = await exportWorkspace(workspace.id);
  await audit({ workspaceId: workspace.id, actorUserId: user.id, action: "workspace.exported", req, correlationId });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="verdant-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
