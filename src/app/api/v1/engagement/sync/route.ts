import { and, eq } from "drizzle-orm";
import { isPlatform } from "@/lib/platforms";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { syncAccount } from "@/server/engagement/service";
import { apiRoute } from "@/server/http/handler";
import { logger } from "@/server/logger";
import { PlatformError } from "@/server/platforms/types";
import { RATE_LIMITS } from "@/server/rate-limit";

/** "Refresh now": pull posts, comments and mentions for every connected account (or one app with ?platform=). */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.oauth }, async ({ req, workspace }) => {
  const platform = new URL(req.url).searchParams.get("platform");
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspace.id), eq(socialAccounts.status, "connected"), isPlatform(platform) ? eq(socialAccounts.platform, platform) : undefined));
  const results: { accountId: string; newItems: number; error?: string }[] = [];
  for (const a of accounts) {
    try {
      results.push({ accountId: a.id, newItems: await syncAccount(a) });
    } catch (err) {
      logger.warn({ err, accountId: a.id }, "manual engagement sync failed");
      results.push({ accountId: a.id, newItems: 0, error: err instanceof PlatformError ? err.message : "Sync failed" });
    }
  }
  return { results, newItems: results.reduce((s, r) => s + r.newItems, 0) };
});
