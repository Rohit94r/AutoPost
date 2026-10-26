import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { brandProfiles, subscriptionRecords, workspaceMembers, workspaces } from "@/server/db/schema";
import { env } from "@/server/env";
import { forbidden } from "@/server/errors";

export const ROLES = ["viewer", "editor", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const roleAtLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 40) || "workspace"
  );
}

/** Creates the user's personal workspace on first sign-up (idempotent). */
export async function ensurePersonalWorkspace(user: { id: string; name: string; email: string }, conn: DbOrTx = db) {
  const existing = await conn
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .limit(1);
  if (existing[0]) return existing[0].workspaceId;

  return conn.transaction(async (tx) => {
    const base = user.name?.trim() || user.email.split("@")[0] || "My";
    const [ws] = await tx
      .insert(workspaces)
      .values({
        name: `${base}'s workspace`,
        slug: `${slugify(base)}-${crypto.randomUUID().slice(0, 6)}`,
        plan: env().DEFAULT_PLAN,
        documentRetentionDays: env().DOCUMENT_RETENTION_DAYS,
        createdBy: user.id,
      })
      .returning({ id: workspaces.id });
    const workspaceId = ws!.id;
    await tx.insert(workspaceMembers).values({ workspaceId, userId: user.id, role: "owner" });
    await tx.insert(brandProfiles).values({ workspaceId, name: base, isDefault: true });
    await tx.insert(subscriptionRecords).values({ workspaceId, plan: env().DEFAULT_PLAN, provider: "manual" });
    return workspaceId;
  });
}

export async function listMemberships(userId: string, conn: DbOrTx = db) {
  return conn
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, role: workspaceMembers.role, timezone: workspaces.timezone, plan: workspaces.plan })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt));
}

export async function getMembership(userId: string, workspaceId: string, conn: DbOrTx = db) {
  const rows = await conn
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Throws unless the user is a member of the workspace with at least `min` role. */
export async function assertWorkspaceAccess(userId: string, workspaceId: string, min: Role = "viewer", conn: DbOrTx = db) {
  const m = await getMembership(userId, workspaceId, conn);
  if (!m) throw forbidden();
  if (!roleAtLeast(m.role, min)) throw forbidden(`This action requires the ${min} role`);
  return m;
}
