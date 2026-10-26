import { desc, eq } from "drizzle-orm";
import { PLATFORMS } from "@/lib/platforms";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { apiRoute } from "@/server/http/handler";
import { getAdapter } from "@/server/platforms/registry";

/** Account list for the browser — never includes tokens (they live in a separate encrypted table). */
export const GET = apiRoute({}, async ({ workspace }) => {
  const rows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      displayName: socialAccounts.displayName,
      username: socialAccounts.username,
      avatarUrl: socialAccounts.avatarUrl,
      accountType: socialAccounts.accountType,
      status: socialAccounts.status,
      grantedScopes: socialAccounts.grantedScopes,
      tokenExpiresAt: socialAccounts.tokenExpiresAt,
      lastError: socialAccounts.lastError,
      createdAt: socialAccounts.createdAt,
      updatedAt: socialAccounts.updatedAt,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.workspaceId, workspace.id))
    .orderBy(desc(socialAccounts.createdAt));
  const platforms = PLATFORMS.map((p) => {
    const a = getAdapter(p);
    return { platform: p, configured: a.isConfigured(), scopes: a.requestedScopes(), refreshable: p !== "linkedin" };
  });
  return { accounts: rows, platforms };
});
