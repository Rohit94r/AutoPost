import { BarChart3, CheckCircle2, Info, Percent, XCircle } from "lucide-react";
import Link from "next/link";
import { PublishedChart } from "@/components/analytics/published-chart";
import { CardTitle, GlassCard, PageHeader, Stat } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/ui/platform";
import { PLATFORM_META } from "@/lib/platforms";
import { cn, pct, timeAgo } from "@/lib/utils";
import { platformMetrics, publishingSummary } from "@/server/analytics/service";
import { requirePageContext } from "@/server/auth/session";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];
const REASON: Record<string, string> = {
  permission_missing: "permission not granted",
  unsupported: "not provided for this post type",
  unavailable: "not collected",
};

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const [pub, platforms] = await Promise.all([publishingSummary(ctx.workspace.id, from, to), platformMetrics(ctx.workspace.id, from, to)]);
  const series = Object.values(
    pub.series.reduce<Record<string, { day: string; n: number }>>((acc, r) => {
      acc[r.day] = { day: r.day, n: (acc[r.day]?.n ?? 0) + r.n };
      return acc;
    }, {}),
  );

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Performance"
        description="Publishing numbers come from Verdant's own records. Engagement comes only from platform APIs, and missing data is labelled rather than estimated."
        actions={
          <nav className="inline-flex rounded-xl bg-black/25 p-1" aria-label="Date range">
            {RANGES.map((r) => (
              <Link key={r} href={`/analytics?days=${r}`} aria-current={r === days ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", r === days ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
                {r} days
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Published" value={pub.totals.published} hint="Confirmed by platform APIs" icon={<CheckCircle2 />} />
        <Stat label="Failed" value={pub.totals.failed} hint="Includes needs-reconnection" icon={<XCircle />} tone={pub.totals.failed ? "bad" : "default"} />
        <Stat label="Success rate" value={pct(pub.totals.successRate)} hint="published ÷ (published + failed)" icon={<Percent />} />
      </div>

      <GlassCard className="mt-4">
        <CardTitle icon={<BarChart3 />} description={`Last ${days} days`}>
          Posts published per day
        </CardTitle>
        <PublishedChart series={series} days={days} end={to.toISOString()} />
      </GlassCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {platforms.map((p) => {
          const pp = pub.byPlatform.find((b) => b.platform === p.platform)!;
          return (
            <GlassCard key={p.platform}>
              <div className="mb-4 flex items-center justify-between">
                <PlatformBadge platform={p.platform} withLabel />
                <span className="text-xs text-stone">{p.lastCollectedAt ? `Metrics updated ${timeAgo(p.lastCollectedAt)}` : "No metrics collected yet"}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-black/20 p-2">
                  <dt className="text-[11px] text-stone">Published</dt>
                  <dd className="font-display text-2xl text-white">{pp.published}</dd>
                </div>
                <div className="rounded-xl bg-black/20 p-2">
                  <dt className="text-[11px] text-stone">Failed</dt>
                  <dd className="font-display text-2xl text-white">{pp.failed}</dd>
                </div>
                <div className="rounded-xl bg-black/20 p-2">
                  <dt className="text-[11px] text-stone">Success</dt>
                  <dd className="font-display text-2xl text-white">{pct(pp.successRate)}</dd>
                </div>
              </dl>
              <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-stone">Platform metrics · {p.posts} post{p.posts === 1 ? "" : "s"}</h3>
              {p.metrics.length === 0 ? (
                <p className="text-sm text-fog">No engagement data yet. Metrics are collected for posts from the last 30 days, every 12 hours.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {p.metrics.map((m) => (
                      <tr key={m.metric} className="border-t border-white/6">
                        <td className="py-1.5 capitalize text-fog">{m.metric.replace(/_/g, " ")}</td>
                        <td className="py-1.5 text-right tabular-nums text-white">
                          {m.total === null ? <span className="text-xs text-stone">{m.reasons.map((r) => REASON[r] ?? r).join(", ") || "n/a"}</span> : m.total.toLocaleString()}
                          {m.total !== null && m.postsWithout > 0 && <span className="ml-1 text-[10px] text-stone">({m.postsWithout} without data)</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-white/6">
                      <td className="py-1.5 text-fog">Engagement rate</td>
                      <td className="py-1.5 text-right tabular-nums text-white">
                        {p.engagement.rate === null ? <span className="text-xs text-stone">not calculable</span> : `${pct(p.engagement.rate)}`}
                        {p.engagement.rate !== null && <span className="ml-1 text-[10px] text-stone">÷ {p.engagement.basis}, {p.engagement.postsUsed} posts</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              {p.notes.length > 0 && (
                <p className="mt-3 flex gap-1.5 text-xs text-stone">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> {p.notes.join(" ")}
                </p>
              )}
              <p className="sr-only">{PLATFORM_META[p.platform].label} summary</p>
            </GlassCard>
          );
        })}
      </div>
    </>
  );
}
