import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import {
  auditLogs,
  brandProfiles,
  contentItems,
  contentVariants,
  documentExtractions,
  mediaAssets,
  publishedPosts,
  publishingJobs,
  socialAccounts,
  uploadedDocuments,
  users,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import { disconnectAccount } from "@/server/oauth/service";
import { storage } from "@/server/storage";

/** Export everything in a workspace as JSON (no tokens, no file bytes). */
export async function exportWorkspace(workspaceId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const [brands, content, variants, accounts, jobs, posts, docs, extractions, media, logs] = await Promise.all([
    db.select().from(brandProfiles).where(eq(brandProfiles.workspaceId, workspaceId)),
    db.select().from(contentItems).where(eq(contentItems.workspaceId, workspaceId)),
    db.select().from(contentVariants).where(eq(contentVariants.workspaceId, workspaceId)),
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName, username: socialAccounts.username, status: socialAccounts.status, grantedScopes: socialAccounts.grantedScopes, createdAt: socialAccounts.createdAt })
      .from(socialAccounts)
      .where(eq(socialAccounts.workspaceId, workspaceId)),
    db.select().from(publishingJobs).where(eq(publishingJobs.workspaceId, workspaceId)),
    db.select().from(publishedPosts).where(eq(publishedPosts.workspaceId, workspaceId)),
    db.select({ id: uploadedDocuments.id, originalFilename: uploadedDocuments.originalFilename, mimeType: uploadedDocuments.mimeType, status: uploadedDocuments.status, createdAt: uploadedDocuments.createdAt }).from(uploadedDocuments).where(eq(uploadedDocuments.workspaceId, workspaceId)),
    db.select().from(documentExtractions).where(eq(documentExtractions.workspaceId, workspaceId)),
    db.select({ id: mediaAssets.id, kind: mediaAssets.kind, originalFilename: mediaAssets.originalFilename, createdAt: mediaAssets.createdAt }).from(mediaAssets).where(eq(mediaAssets.workspaceId, workspaceId)),
    db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
  ]);
  return { exportedAt: new Date().toISOString(), workspace: ws, brandProfiles: brands, content, variants, socialAccounts: accounts, publishingJobs: jobs.map(({ payloadSnapshot, ...j }) => ({ ...j, payloadSnapshot })), publishedPosts: posts, documents: docs, documentExtractions: extractions, media, auditLogs: logs };
}

/**
 * Delete a user account: revoke/delete social credentials and stored files for workspaces the
 * user solely owns, delete those workspaces (cascades), then the user (cascades sessions).
 */
export async function deleteUserAccount(userId: string, req?: Request) {
  const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  for (const m of memberships) {
    if (m.role !== "owner") continue;
    const otherOwners = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "owner"), ne(workspaceMembers.userId, userId)));
    if (otherOwners.length) continue;
    const accounts = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, m.workspaceId), ne(socialAccounts.status, "disconnected")));
    for (const a of accounts) await disconnectAccount({ workspaceId: m.workspaceId, accountId: a.id, userId, req }).catch((err) => logger.warn({ err }, "disconnect during deletion failed"));
    const files = [
      ...(await db.select({ k: mediaAssets.storageKey, t: mediaAssets.thumbnailKey }).from(mediaAssets).where(eq(mediaAssets.workspaceId, m.workspaceId))).flatMap((r) => [r.k, r.t]),
      ...(await db.select({ k: uploadedDocuments.storageKey }).from(uploadedDocuments).where(eq(uploadedDocuments.workspaceId, m.workspaceId))).map((r) => r.k),
    ].filter((k): k is string => Boolean(k));
    for (const k of files) await storage().delete(k).catch(() => undefined);
    await db.delete(workspaces).where(inArray(workspaces.id, [m.workspaceId]));
  }
  await audit({ action: "user.deleted", targetType: "user", targetId: userId, req });
  await db.delete(users).where(eq(users.id, userId));
}
