/**
 * Analytics calculations (pure, documented, unit-tested). See docs/ARCHITECTURE.md#analytics.
 */

/** Publishing success rate = published / (published + failed). Cancelled & pending are excluded. Null when no finished jobs. */
export function successRate(published: number, failed: number): number | null {
  const finished = published + failed;
  return finished === 0 ? null : published / finished;
}

export interface PostMetricRow {
  postId: string;
  metric: string;
  value: number | null;
  availability: "available" | "unsupported" | "permission_missing" | "unavailable";
}

const INTERACTION_METRICS = new Set(["likes", "reactions", "comments", "shares", "reposts", "replies", "quotes", "saved", "bookmarks"]);
const EXPOSURE_METRICS = ["impressions", "views", "reach"];

/**
 * Engagement rate = Σ interactions / Σ exposure, computed only over posts that report BOTH an
 * exposure metric (impressions, else views, else reach) and at least one interaction metric.
 * Returns null when no post qualifies — we never estimate missing data.
 */
export function engagementRate(rows: PostMetricRow[]): { rate: number | null; postsUsed: number; basis: string | null } {
  const byPost = new Map<string, PostMetricRow[]>();
  for (const r of rows) byPost.set(r.postId, [...(byPost.get(r.postId) ?? []), r]);
  let interactions = 0;
  let exposure = 0;
  let used = 0;
  const bases = new Set<string>();
  for (const metrics of byPost.values()) {
    const avail = metrics.filter((m) => m.availability === "available" && m.value !== null);
    const exp = EXPOSURE_METRICS.map((name) => avail.find((m) => m.metric === name)).find(Boolean);
    const inter = avail.filter((m) => INTERACTION_METRICS.has(m.metric));
    if (!exp || !exp.value || inter.length === 0) continue;
    exposure += exp.value;
    interactions += inter.reduce((s, m) => s + (m.value ?? 0), 0);
    bases.add(exp.metric);
    used++;
  }
  return { rate: used && exposure > 0 ? interactions / exposure : null, postsUsed: used, basis: bases.size ? [...bases].join("/") : null };
}

/** Sum an available metric across posts; reports how many posts had data vs not. */
export function sumMetric(rows: PostMetricRow[], metric: string) {
  const relevant = rows.filter((r) => r.metric === metric);
  const available = relevant.filter((r) => r.availability === "available" && r.value !== null);
  return {
    total: available.length ? available.reduce((s, r) => s + (r.value ?? 0), 0) : null,
    postsWithData: available.length,
    postsWithout: relevant.length - available.length,
    reasons: [...new Set(relevant.filter((r) => r.availability !== "available").map((r) => r.availability))],
  };
}
