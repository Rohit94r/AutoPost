import "server-only";
import { and, between, eq, inArray } from "drizzle-orm";
import { PLATFORM_META } from "@/lib/platforms";
import { db } from "@/server/db";
import { contentItems, publishingJobs, socialAccounts } from "@/server/db/schema";
import { purgeExpiredDocumentFiles } from "@/server/documents/service";
import { purgeOldIdempotencyKeys } from "@/server/http/idempotency";
import { logger } from "@/server/logger";
import { notify } from "@/server/notifications/service";
import { markAccount, purgeExpiredStates, refreshAccount } from "@/server/oauth/service";
import { failStuckJobs, recoverDueJobs } from "@/server/publishing/executor";

const DAY = 86400_000;
const today = () => new Date().toISOString().slice(0, 10);

/** Every ~30s: recover due jobs (restart/Redis-loss safety) and fail stuck ones. */
export async function sweep() {
  const [recovered, stuck] = await Promise.all([recoverDueJobs(), failStuckJobs()]);
  if (recovered || stuck) logger.info({ recovered, stuck }, "sweep");
  return { recovered, stuck };
}

/**
 * Hourly token maintenance, per platform:
 * - X: short-lived access tokens are refreshed on demand at publish time. Here we only keep the
 *   rotating refresh token alive (refresh if untouched for 30 days).
 * - Instagram: long-lived tokens are refreshed proactively when < 7 days remain.
 * - LinkedIn: refresh only works for partner apps; otherwise remind the user before expiry.
 * An account is marked expired only when the token is past expiry AND can't be refreshed, or when
 * the platform rejects the refresh (handled inside refreshAccount). Transient errors never expire it.
 */
export async function maintainTokens(now = new Date()) {
  const accounts = await db.select().from(socialAccounts).where(inArray(socialAccounts.status, ["connected", "permission_required"]));
  let refreshed = 0;
  let checked = 0;
  for (const account of accounts) {
    const expiresAt = account.tokenExpiresAt?.getTime() ?? null;
    const label = `${PLATFORM_META[account.platform].label} · ${account.displayName}`;

    if (account.platform === "x") {
      const idleFor = now.getTime() - (account.lastRefreshedAt ?? account.createdAt).getTime();
      if (idleFor < 30 * DAY) continue;
    } else if (expiresAt === null || expiresAt > now.getTime() + 7 * DAY) {
      continue;
    }
    checked++;

    let didRefresh = false;
    try {
      didRefresh = await refreshAccount(account);
    } catch (err) {
      logger.warn({ err, accountId: account.id }, "scheduled token refresh failed");
      continue; // auth failures were recorded by refreshAccount; transient ones retry next hour
    }
    if (didRefresh) {
      refreshed++;
      continue;
    }
    if (account.platform === "x") continue;

    if (expiresAt !== null && expiresAt < now.getTime()) {
      await markAccount(account.id, "expired", "Access token expired");
      await notify({ workspaceId: account.workspaceId, type: "account_reconnect", severity: "error", title: `${label} disconnected`, body: "The connection expired. Reconnect it to keep publishing.", link: "/accounts", dedupeKey: `expired:${account.id}:${today()}` });
    } else if (expiresAt !== null) {
      const days = Math.max(0, Math.ceil((expiresAt - now.getTime()) / DAY));
      await notify({ workspaceId: account.workspaceId, type: "account_expiring", severity: "warning", title: `${label} expires in ${days} day${days === 1 ? "" : "s"}`, body: "Reconnect the account to avoid failed posts.", link: "/accounts", dedupeKey: `expiring:${account.id}:${today()}` });
    }
  }
  return { checked, refreshed };
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
