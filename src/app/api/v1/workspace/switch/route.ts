import { NextResponse } from "next/server";
import { z } from "zod";
import { WORKSPACE_COOKIE } from "@/server/auth/session";
import { env } from "@/server/env";
import { apiRoute, parseJson } from "@/server/http/handler";
import { assertWorkspaceAccess } from "@/server/workspaces/service";

export const POST = apiRoute({ role: "viewer" }, async ({ req, user }) => {
  const { workspaceId } = await parseJson(req, z.object({ workspaceId: z.string().uuid() }));
  await assertWorkspaceAccess(user.id, workspaceId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
