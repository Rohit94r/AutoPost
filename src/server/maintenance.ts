import "server-only";
import { and, between, eq, inArray, lt } from "drizzle-orm";
import { PLATFORM_META } from "@/lib/platforms";
import { db } from "@/server/db";
import { contentItems, publishingJobs, socialAccounts } from "@/server/db/schema";
import { purgeExpiredDocumentFiles } from "@/server/documents/service";
import { purgeOldIdempotencyKeys } from "@/server/http/idempotency";
import { logger } from "@/server/logger";
import { notify } from "@/server/notifications/service";
import { markAccount, purgeExpiredStates, refreshAccount } from "@/server/oauth/service";
import { getAdapter } from "@/server/platforms/registry";
import { failStuckJobs, recoverDueJobs } from "@/server/publishing/executor";

const DAY = 86400_000;
const today = () => new Date().toISOString().slice(0, 10);

/** Every ~30s: recover due jobs (restart/Redis-loss safety) and fail stuck ones. */
export async function sweep() {
  const [recovered, stuck] = await Promise.all([recoverDueJobs(), failStuckJobs()]);
  if (recovered || stuck) logger.info({ recovered, stuck }, "sweep");
  return { recovered, stuck };
}

/** Hourly: refresh tokens that can be refreshed, warn about ones that can't, mark expired ones. */
export async function maintainTokens(now = new Date()) {
  const expiring = await db
    .select()
    .from(socialAccounts)
    .where(and(inArray(socialAccounts.status, ["connected", "permission_required"]), lt(socialAccounts.tokenExpiresAt, new Date(now.getTime() + 7 * DAY))));
  let refreshed = 0;
  for (const account of expiring) {
    const adapter = getAdapter(account.platform);
    const label = `${PLATFORM_META[account.platform].label} · ${account.displayName}`;
    const expired = account.tokenExpiresAt && account.tokenExpiresAt.getTime() < now.getTime();
    try {
      if (await refreshAccount(account)) {
        refreshed++;
        continue;
      }
    } catch (err) {
      logger.warn({ err, accountId: account.id }, "scheduled token refresh failed");
    }
    if (expired) {
      await markAccount(account.id, "expired", "Access token expired");
      await notify({ workspaceId: account.workspaceId, type: "account_reconnect", severity: "error", title: `${label} disconnected`, body: "The connection expired. Reconnect it to keep publishing.", link: "/accounts", dedupeKey: `expired:${account.id}:${today()}` });
    } else if (!adapter.canRefresh({ refreshToken: null, accessToken: "", tokenExpiresAt: account.tokenExpiresAt, lastRefreshedAt: account.lastRefreshedAt, createdAt: account.createdAt })) {
      const days = Math.max(0, Math.ceil(((account.tokenExpiresAt?.getTime() ?? now.getTime()) - now.getTime()) / DAY));
      await notify({ workspaceId: account.workspaceId, type: "account_expiring", severity: "warning", title: `${label} expires in ${days} day${days === 1 ? "" : "s"}`, body: "Reconnect the account to avoid failed posts.", link: "/accounts", dedupeKey: `expiring:${account.id}:${today()}` });
    }
  }
  return { checked: expiring.length, refreshed };
}

/** Reminder ~1 hour before a scheduled post goes out (one per post). */
export async function scheduleReminders(now = new Date()) {
  const soon = await db
    .selectDistinct({ contentId: publishingJobs.contentId, workspaceId: publishingJobs.workspaceId, title: contentItems.title, at: publishingJobs.scheduledAt })
    .from(publishingJobs)
    .innerJoin(contentItems, eq(contentItems.id, publishingJobs.contentId))
    .where(and(eq(publishingJobs.status, "scheduled"), between(publishingJobs.scheduledAt, new Date(now.getTime() + 50 * 60_000), new Date(now.getTime() + 70 * 60_000))));
  for (const s of soon) {
    await notify({ workspaceId: s.workspaceId, type: "schedule_reminder", title: `Going out in about an hour: ${s.title}`, body: "Last chance to edit or cancel.", link: `/compose?id=${s.contentId}`, dedupeKey: `reminder:${s.contentId}:${s.at.toISOString()}` });
  }
  return soon.length;
}

/** Every few hours: retention + housekeeping. */
export async function retention() {
  const files = await purgeExpiredDocumentFiles();
  await purgeExpiredStates();
  await purgeOldIdempotencyKeys();
  return { documentFilesPurged: files };
}
