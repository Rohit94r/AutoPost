import "server-only";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Platform } from "@/lib/platforms";
import { db } from "@/server/db";
import { engagementItems, postAnalytics, publishedPosts, socialAccounts } from "@/server/db/schema";

export interface ChannelPost {
  id: string;
  accountId: string;
  externalPostId: string;
  url: string | null;
  text: string | null;
  thumbnailUrl: string | null;
  source: string;
  publishedAt: Date;
  metrics: Record<string, number | null>;
  comments: number;
  openComments: number;
}

/** Everything the per-platform page shows: accounts + stats, posts with latest metrics and comment counts. */
export async function channelOverview(workspaceId: string, platform: Platform) {
  const accounts = await db
    .select({
      id: socialAccounts.id,
      displayName: socialAccounts.displayName,
      username: socialAccounts.username,
      avatarUrl: socialAccounts.avatarUrl,
      status: socialAccounts.status,
      lastError: socialAccounts.lastError,
      metadata: socialAccounts.metadata,
    })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.platform, platform), ne(socialAccounts.status, "disconnected")));

  const posts = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.workspaceId, workspaceId), eq(publishedPosts.platform, platform)))
    .orderBy(desc(publishedPosts.publishedAt))
    .limit(60);
  const ids = posts.map((p) => p.id);

  const [metricRows, commentRows] = ids.length
    ? await Promise.all([
        db.execute<{ post_id: string; metric: string; value: string | number | null }>(sql`
          select distinct on (published_post_id, metric) published_post_id as post_id, metric, value
          from ${postAnalytics}
          where ${inArray(postAnalytics.publishedPostId, ids)} and availability = 'available'
          order by published_post_id, metric, collected_at desc`),
        db
          .select({ postId: engagementItems.publishedPostId, status: engagementItems.status, n: count() })
          .from(engagementItems)
          .where(and(inArray(engagementItems.publishedPostId, ids), ne(engagementItems.status, "own")))
          .groupBy(engagementItems.publishedPostId, engagementItems.status),
      ])
    : [[], []];
  const metricList = (Array.isArray(metricRows) ? metricRows : (metricRows as { rows: unknown[] }).rows) as { post_id: string; metric: string; value: string | number | null }[];

  const result: ChannelPost[] = posts.map((p) => {
    const metrics: Record<string, number | null> = {};
    for (const m of metricList.filter((r) => r.post_id === p.id)) metrics[m.metric] = m.value === null ? null : Number(m.value);
    const c = commentRows.filter((r) => r.postId === p.id);
    return {
      id: p.id,
      accountId: p.socialAccountId,
      externalPostId: p.externalPostId,
      url: p.url,
      text: p.text,
      thumbnailUrl: p.thumbnailUrl,
      source: p.source,
      publishedAt: p.publishedAt,
      metrics,
      comments: c.reduce((s, r) => s + r.n, 0),
      openComments: c.filter((r) => r.status === "new" || r.status === "needs_review").reduce((s, r) => s + r.n, 0),
    };
  });

  const sum = (key: string) => {
    const vals = result.map((p) => p.metrics[key]).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const totals = {
    posts: result.length,
    comments: result.reduce((s, p) => s + p.comments, 0),
    openComments: result.reduce((s, p) => s + p.openComments, 0),
    likes: sum("likes") ?? sum("reactions"),
    views: sum("views") ?? sum("impressions"),
    shares: sum("shares") ?? sum("reposts"),
  };
  return {
    accounts: accounts.map((a) => ({ ...a, stats: ((a.metadata as { stats?: Record<string, number | null> }).stats ?? null) as Record<string, number | null> | null, metadata: undefined })),
    posts: result,
    totals,
  };
}

/** Sidebar badges: connected platforms with unread comment counts. */
export async function connectedPlatforms(workspaceId: string) {
  const [accounts, open] = await Promise.all([
    db
      .select({ platform: socialAccounts.platform, n: count() })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, workspaceId), ne(socialAccounts.status, "disconnected")))
      .groupBy(socialAccounts.platform),
    db
      .select({ platform: engagementItems.platform, n: count() })
      .from(engagementItems)
      .where(and(eq(engagementItems.workspaceId, workspaceId), inArray(engagementItems.status, ["new", "needs_review"])))
      .groupBy(engagementItems.platform),
  ]);
  return accounts.map((a) => ({ platform: a.platform, accounts: a.n, open: open.find((o) => o.platform === a.platform)?.n ?? 0 }));
}
