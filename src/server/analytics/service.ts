import "server-only";
import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { engagementRate, successRate, sumMetric, type PostMetricRow } from "@/lib/analytics";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { db } from "@/server/db";
import { postAnalytics, publishedPosts, publishingJobs, socialAccounts } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { getAccessToken } from "@/server/oauth/service";
import { getAdapter } from "@/server/platforms/registry";

/** Publishing analytics from our own records — always available, always real. */
export async function publishingSummary(workspaceId: string, from: Date, to: Date) {
  const rows = await db
    .select({ platform: publishingJobs.platform, status: publishingJobs.status, n: sql<number>`count(*)::int` })
    .from(publishingJobs)
    .where(and(eq(publishingJobs.workspaceId, workspaceId), gte(publishingJobs.scheduledAt, from), lt(publishingJobs.scheduledAt, to)))
    .groupBy(publishingJobs.platform, publishingJobs.status);
  const byPlatform = PLATFORMS.map((p) => {
    const get = (s: string) => rows.filter((r) => r.platform === p && r.status === s).reduce((a, r) => a + r.n, 0);
    const published = get("published");
    const failed = get("failed") + get("needs_reconnection");
    return { platform: p, published, failed, scheduled: get("scheduled") + get("queued"), cancelled: get("cancelled"), successRate: successRate(published, failed) };
  });
  const published = byPlatform.reduce((s, p) => s + p.published, 0);
  const failed = byPlatform.reduce((s, p) => s + p.failed, 0);

  const series = await db
    .select({ day: sql<string>`to_char(date_trunc('day', ${publishedPosts.publishedAt}), 'YYYY-MM-DD')`, platform: publishedPosts.platform, n: sql<number>`count(*)::int` })
    .from(publishedPosts)
    .where(and(eq(publishedPosts.workspaceId, workspaceId), gte(publishedPosts.publishedAt, from), lt(publishedPosts.publishedAt, to)))
    .groupBy(sql`1`, publishedPosts.platform)
    .orderBy(sql`1`);

  return { totals: { published, failed, successRate: successRate(published, failed) }, byPlatform, series };
}

/** Latest snapshot per (post, metric) for the window, aggregated per platform with availability. */
export async function platformMetrics(workspaceId: string, from: Date, to: Date) {
  const latest = await db.execute<{ post_id: string; platform: Platform; metric: string; value: string | null; availability: PostMetricRow["availability"]; collected_at: string; note: string | null }>(sql`
    select distinct on (pa.published_post_id, pa.metric)
      pa.published_post_id as post_id, pa.platform, pa.metric, pa.value, pa.availability, pa.collected_at, pa.note
    from ${postAnalytics} pa
    join ${publishedPosts} pp on pp.id = pa.published_post_id
    where pa.workspace_id = ${workspaceId} and pp.published_at >= ${from.toISOString()}::timestamptz and pp.published_at < ${to.toISOString()}::timestamptz
    order by pa.published_post_id, pa.metric, pa.collected_at desc
  `);
  const rows = (Array.isArray(latest) ? latest : (latest as { rows: unknown[] }).rows) as {
    post_id: string; platform: Platform; metric: string; value: string | number | null; availability: PostMetricRow["availability"]; collected_at: string | Date; note: string | null;
  }[];

  return PLATFORMS.map((platform) => {
    const pr: PostMetricRow[] = rows.filter((r) => r.platform === platform).map((r) => ({ postId: r.post_id, metric: r.metric, value: r.value === null ? null : Number(r.value), availability: r.availability }));
    const metricNames = [...new Set(pr.map((r) => r.metric))];
    const notes = [...new Set(rows.filter((r) => r.platform === platform && r.note).map((r) => r.note!))];
    const lastCollected = rows.filter((r) => r.platform === platform).map((r) => new Date(r.collected_at).getTime());
    return {
      platform,
      posts: new Set(pr.map((r) => r.postId)).size,
      metrics: metricNames.map((m) => ({ metric: m, ...sumMetric(pr, m) })),
      engagement: engagementRate(pr),
      notes,
      lastCollectedAt: lastCollected.length ? new Date(Math.max(...lastCollected)).toISOString() : null,
    };
  });
}

/** Worker: collect metrics for recent posts (≤ 30 days) not refreshed in the last 12 hours. */
export async function collectDueMetrics(limit = 50) {
  const now = Date.now();
  const due = await db
    .select({ post: publishedPosts, account: socialAccounts })
    .from(publishedPosts)
    .innerJoin(socialAccounts, eq(socialAccounts.id, publishedPosts.socialAccountId))
    .where(
      and(
        gte(publishedPosts.publishedAt, new Date(now - 30 * 86400_000)),
        or(isNull(publishedPosts.lastMetricsAt), lt(publishedPosts.lastMetricsAt, new Date(now - 12 * 3600_000))),
        eq(socialAccounts.status, "connected"),
      ),
    )
    .orderBy(asc(publishedPosts.lastMetricsAt))
    .limit(limit);
  let collected = 0;
  for (const { post, account } of due) {
    try {
      const token = await getAccessToken(account);
      const metrics = await getAdapter(post.platform).fetchMetrics({
        accessToken: token,
        externalPostId: post.externalPostId,
        grantedScopes: account.grantedScopes,
        account: { externalAccountId: account.externalAccountId, accountType: account.accountType, username: account.username, metadata: account.metadata },
      });
      const collectedAt = new Date();
      if (metrics.length) {
        await db.insert(postAnalytics).values(
          metrics.map((m) => ({ publishedPostId: post.id, workspaceId: post.workspaceId, platform: post.platform, metric: m.metric, value: m.value, availability: m.availability, note: m.note ?? null, collectedAt })),
        );
      }
      await db.update(publishedPosts).set({ lastMetricsAt: collectedAt }).where(eq(publishedPosts.id, post.id));
      collected++;
    } catch (err) {
      logger.warn({ err, postId: post.id }, "metrics collection failed");
      await db.update(publishedPosts).set({ lastMetricsAt: new Date() }).where(eq(publishedPosts.id, post.id));
    }
  }
  return collected;
}
