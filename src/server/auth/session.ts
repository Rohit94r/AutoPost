import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/server/auth/auth";
import { unauthorized } from "@/server/errors";
import {
  assertWorkspaceAccess,
  ensurePersonalWorkspace,
  getMembership,
  listMemberships,
  type Role,
} from "@/server/workspaces/service";

export const WORKSPACE_COOKIE = "flowt_ws";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

/** Resolve the active workspace: cookie (if the user is still a member) → first membership → create one. */
async function resolveWorkspace(user: SessionUser) {
  const jar = await cookies();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  if (wanted && /^[0-9a-f-]{36}$/i.test(wanted)) {
    const m = await getMembership(user.id, wanted);
    if (m) return m;
  }
  const memberships = await listMemberships(user.id);
  const first = memberships[0];
  const id = first ? first.id : await ensurePersonalWorkspace(user);
  return (await getMembership(user.id, id))!;
}

export interface WorkspaceContext {
  user: SessionUser;
  workspace: Awaited<ReturnType<typeof resolveWorkspace>>["workspace"];
  role: Role;
}

/** For server components/pages: redirects to sign-in when unauthenticated. */
export const requirePageContext = cache(async (): Promise<WorkspaceContext> => {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const m = await resolveWorkspace(session.user);
  return { user: session.user, workspace: m.workspace, role: m.role };
});

/** For API routes: throws 401/403 instead of redirecting. */
export async function requireApiContext(minRole: Role = "viewer"): Promise<WorkspaceContext> {
  const session = await getSession();
  if (!session) throw unauthorized();
  const m = await resolveWorkspace(session.user);
  await assertWorkspaceAccess(session.user.id, m.workspace.id, minRole);
  return { user: session.user, workspace: m.workspace, role: m.role };
}

export async function requireApiUser() {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session.user;
}
