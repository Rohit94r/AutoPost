import "server-only";
import { and, asc, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, contentItems, engagementItems, publishedPosts, publishingJobs, socialAccounts, users } from "@/server/db/schema";
import { statusCounts } from "@/server/publishing/service";
import { usageSummary } from "@/server/usage/service";

export async function dashboardData(workspaceId: string) {
  const now = new Date();
  const [counts, accounts, upcoming, recent, usage, drafts] = await Promise.all([
    statusCounts(workspaceId),
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName, username: socialAccounts.username, avatarUrl: socialAccounts.avatarUrl, status: socialAccounts.status, tokenExpiresAt: socialAccounts.tokenExpiresAt })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, workspaceId), ne(socialAccounts.status, "disconnected"))),
    db
      .select({ id: publishingJobs.id, platform: publishingJobs.platform, scheduledAt: publishingJobs.scheduledAt, timezone: publishingJobs.timezone, status: publishingJobs.status, contentId: contentItems.id, title: contentItems.title, account: socialAccounts.displayName })
      .from(publishingJobs)
      .innerJoin(contentItems, eq(contentItems.id, publishingJobs.contentId))
      .innerJoin(socialAccounts, eq(socialAccounts.id, publishingJobs.socialAccountId))
      .where(and(eq(publishingJobs.workspaceId, workspaceId), inArray(publishingJobs.status, ["scheduled", "queued"]), gte(publishingJobs.scheduledAt, new Date(now.getTime() - 3600_000))))
      .orderBy(asc(publishingJobs.scheduledAt))
      .limit(8),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actor: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
    usageSummary(workspaceId),
    db.select({ id: contentItems.id }).from(contentItems).where(and(eq(contentItems.workspaceId, workspaceId), eq(contentItems.status, "draft"))),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
  return {
    stats: {
      scheduled: c("scheduled") + c("queued"),
      published: c("published"),
      failed: c("failed") + c("needs_reconnection"),
      processing: c("processing"),
      drafts: drafts.length,
    },
    accounts,
    upcoming,
    recent,
    usage,
  };
}

/** Overall per-channel summary for the main dashboard (followers, posts, comments waiting). */
export async function channelSummaries(workspaceId: string) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [accounts, posts, open] = await Promise.all([
    db
      .select({ platform: socialAccounts.platform, metadata: socialAccounts.metadata })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, workspaceId), ne(socialAccounts.status, "disconnected"))),
    db
      .select({ platform: publishedPosts.platform, n: count() })
      .from(publishedPosts)
      .where(and(eq(publishedPosts.workspaceId, workspaceId), gte(publishedPosts.publishedAt, since)))
      .groupBy(publishedPosts.platform),
    db
      .select({ platform: engagementItems.platform, n: count() })
      .from(engagementItems)
      .where(and(eq(engagementItems.workspaceId, workspaceId), inArray(engagementItems.status, ["new", "needs_review"])))
      .groupBy(engagementItems.platform),
  ]);
  const platforms = [...new Set(accounts.map((a) => a.platform))];
  return platforms.map((platform) => {
    const accs = accounts.filter((a) => a.platform === platform);
    const followers = accs
      .map((a) => (a.metadata as { stats?: { followers?: number | null } }).stats?.followers)
      .filter((v): v is number => typeof v === "number");
    return {
      platform,
      accounts: accs.length,
      followers: followers.length ? followers.reduce((s, v) => s + v, 0) : null,
      posts30d: posts.find((p) => p.platform === platform)?.n ?? 0,
      openComments: open.find((o) => o.platform === platform)?.n ?? 0,
    };
  });
}
