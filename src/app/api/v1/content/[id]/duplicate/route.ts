import { NextResponse } from "next/server";
import { duplicateContent } from "@/server/content/service";
import { apiRoute, uuidParam } from "@/server/http/handler";

export const POST = apiRoute<{ id: string }>({}, async ({ params, user, workspace }) => {
  const created = await duplicateContent({ workspaceId: workspace.id, userId: user.id }, uuidParam(params.id));
  return NextResponse.json({ content: created }, { status: 201 });
});
