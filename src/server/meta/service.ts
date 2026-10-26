import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { audit } from "@/server/audit";
import { randomToken } from "@/server/crypto";
import { db } from "@/server/db";
import { auditLogs, oauthCredentials, publishingJobs, socialAccounts } from "@/server/db/schema";
import { notify } from "@/server/notifications/service";

/**
 * Meta platform callbacks for Instagram Login apps:
 * - Deauthorize: the user removed the app on Instagram → drop tokens, mark disconnected.
 * - Data deletion: the user asked Meta to delete their data → delete everything we hold that came
 *   from their Instagram account (account record, tokens, its publishing jobs, metrics).
 */

async function accountsFor(instagramUserId: string) {
  return db
    .select({ id: socialAccounts.id, workspaceId: socialAccounts.workspaceId, displayName: socialAccounts.displayName })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.platform, "instagram"), eq(socialAccounts.externalAccountId, instagramUserId)));
}

export async function handleInstagramDeauthorize(instagramUserId: string) {
  const accounts = await accountsFor(instagramUserId);
  for (const a of accounts) {
    await db.transaction(async (tx) => {
      await tx.delete(oauthCredentials).where(eq(oauthCredentials.socialAccountId, a.id));
      await tx.update(socialAccounts).set({ status: "disconnected", disconnectedAt: new Date(), lastError: "Access was removed on Instagram." }).where(eq(socialAccounts.id, a.id));
      await tx
        .update(publishingJobs)
        .set({ status: "needs_reconnection", lastErrorCode: "account_disconnected", lastErrorMessage: "Instagram access was removed by the account owner." })
        .where(and(eq(publishingJobs.socialAccountId, a.id), inArray(publishingJobs.status, ["queued", "scheduled"])));
    });
    await audit({ workspaceId: a.workspaceId, action: "social_account.deauthorized", targetType: "social_account", targetId: a.id, metadata: { platform: "instagram", source: "meta_callback" } });
    await notify({ workspaceId: a.workspaceId, type: "account_reconnect", severity: "warning", title: `Instagram · ${a.displayName} was disconnected`, body: "Access was removed from Instagram's settings.", link: "/accounts" });
  }
  return accounts.length;
}

export async function handleInstagramDataDeletion(instagramUserId: string) {
  const accounts = await accountsFor(instagramUserId);
  const code = randomToken(12);
  if (accounts.length) {
    // Cascades remove credentials, publishing jobs/attempts, published posts and metrics for these accounts.
    await db.delete(socialAccounts).where(inArray(socialAccounts.id, accounts.map((a) => a.id)));
  }
  await audit({ action: "meta.data_deletion", targetType: "deletion_request", targetId: code, metadata: { platform: "instagram", accountsDeleted: accounts.length, completedAt: new Date().toISOString() } });
  for (const a of accounts) {
    await notify({ workspaceId: a.workspaceId, type: "account_reconnect", severity: "warning", title: `Instagram data for ${a.displayName} was deleted`, body: "The account owner requested deletion through Meta.", link: "/accounts" });
  }
  return { code, deleted: accounts.length };
}

export async function deletionStatus(code: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const [row] = await db
    .select({ createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "meta.data_deletion"), eq(auditLogs.targetId, code)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  return row ?? null;
}
