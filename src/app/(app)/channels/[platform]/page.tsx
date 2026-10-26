import { BarChart3, Bot, CheckCircle2, ExternalLink, Eye, Heart, MessageCircle, PenSquare, Repeat2, Users, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishedChart } from "@/components/analytics/published-chart";
import { Inbox } from "@/components/inbox/inbox";
import { Button } from "@/components/ui/button";
import { CardTitle, EmptyState, GlassCard, PageHeader, Stat } from "@/components/ui/misc";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { isPlatform, PLATFORM_META } from "@/lib/platforms";
import { pct, timeAgo } from "@/lib/utils";
import { publishingSummary } from "@/server/analytics/service";
import { requirePageContext } from "@/server/auth/session";
import { channelOverview } from "@/server/channels/service";
import { listRules } from "@/server/engagement/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  return { title: isPlatform(platform) ? PLATFORM_META[platform].label : "App" };
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));
const STAT_LABEL: Record<string, string> = { followers: "Followers", following: "Following", posts: "Posts", views: "Views", likes: "Likes", karma: "Karma", monthlyViews: "Monthly views" };
const DAYS = 30;

/** One app's page: account stats, engagement totals, publishing chart, every post with metrics, and its comments with replies. */
export default async function AppPage({ params, searchParams }: { params: Promise<{ platform: string }>; searchParams: Promise<{ post?: string }> }) {
  const ctx = await requirePageContext();
  const { platform } = await params;
  if (!isPlatform(platform)) notFound();
  const sp = await searchParams;
  const postId = sp.post && /^[0-9a-f-]{36}$/i.test(sp.post) ? sp.post : undefined;
  const meta = PLATFORM_META[platform];
  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86400_000);
  const [{ accounts, posts, totals }, summary, rules] = await Promise.all([channelOverview(ctx.workspace.id, platform), publishingSummary(ctx.workspace.id, from, to), listRules(ctx.workspace.id)]);
  const pub = summary.byPlatform.find((p) => p.platform === platform)!;
  const series = summary.series.filter((s) => s.platform === platform).map((s) => ({ day: s.day, n: s.n }));
  const accountIds = new Set(accounts.map((a) => a.id));
  const activeRules = rules.filter((r) => r.enabled && (r.socialAccountIds.length === 0 || r.socialAccountIds.some((id) => accountIds.has(id))));
  const canComment = meta.can.comments !== "none";
  const filteredPost = postId ? posts.find((p) => p.id === postId) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="App"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl text-white" style={{ backgroundColor: `${meta.color}33`, boxShadow: `inset 0 0 0 1px ${meta.color}66` }}>
              <PlatformIcon platform={platform} className="size-6" />
            </span>
            {meta.label}
          </span>
        }
        description={meta.note}
        actions={
          <>
            {canComment && (
              <Button asChild variant="glass">
                <a href="#comments">
                  <MessageCircle /> Comments {totals.openComments ? `(${totals.openComments})` : ""}
                </a>
              </Button>
            )}
            <Button asChild>
              <Link href="/compose">
                <PenSquare /> New post
              </Link>
            </Button>
          </>
        }
      />

      {accounts.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PlatformIcon platform={platform} className="size-6" />}
            title={`No ${meta.label} account connected`}
            description="Connect one to see its posts, likes, comments and analytics here."
            action={
              <Button asChild>
                <Link href="/accounts">Connect {meta.label}</Link>
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <GlassCard key={a.id} className="flex items-center gap-4">
                {a.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-full bg-white/10 text-lg">{a.displayName[0]}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{a.displayName}</p>
                  {a.username && <p className="truncate text-xs text-stone">{a.username}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fog">
                    {a.stats ? (
                      Object.entries(a.stats)
                        .filter(([, v]) => v !== null)
                        .map(([k, v]) => (
                          <span key={k}>
                            <span className="font-semibold text-white">{fmt(v)}</span> {STAT_LABEL[k] ?? k}
                          </span>
                        ))
                    ) : (
                      <span className="text-stone">Stats appear after the next sync.</span>
                    )}
                  </div>
                </div>
                {a.status !== "connected" && <StatusBadge status={a.status} />}
              </GlassCard>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Posts" value={totals.posts} icon={<PenSquare />} />
            <Stat label="Comments" value={canComment ? totals.comments : "—"} hint={!canComment ? "No comment API" : totals.openComments ? `${totals.openComments} waiting` : "All handled"} icon={<MessageCircle />} tone={totals.openComments ? "warn" : "default"} />
            <Stat label="Likes" value={fmt(totals.likes)} icon={<Heart />} hint={totals.likes === null ? "Not available yet" : undefined} />
            <Stat label="Views" value={fmt(totals.views)} icon={<Eye />} hint={totals.views === null ? "Not available yet" : undefined} />
            <Stat label="Shares" value={fmt(totals.shares)} icon={<Repeat2 />} hint={totals.shares === null ? "Not available yet" : undefined} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <GlassCard className="lg:col-span-2">
              <CardTitle icon={<BarChart3 />} description={`Posts on ${meta.label} per day (published with Verdant or imported), last ${DAYS} days`}>
                Publishing
              </CardTitle>
              <PublishedChart series={series} days={DAYS} end={to.toISOString()} />
            </GlassCard>
            <GlassCard>
              <CardTitle description={`Publishing through Verdant, last ${DAYS} days`}>Delivery</CardTitle>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-fog">
                    <CheckCircle2 className="size-4 text-moss" /> Published
                  </span>
                  <span className="font-semibold text-white">{pub.published}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-fog">
                    <XCircle className="size-4 text-dawn" /> Failed
                  </span>
                  <span className="font-semibold text-white">{pub.failed}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-fog">Scheduled</span>
                  <span className="font-semibold text-white">{pub.scheduled}</span>
                </li>
                <li className="flex items-center justify-between border-t border-white/8 pt-3">
                  <span className="text-fog">Success rate</span>
                  <span className="font-semibold text-white">{pct(pub.successRate)}</span>
                </li>
              </ul>
              {meta.can.comments === "read_reply" && (
                <Link href="/inbox?tab=autopilot" className="mt-4 flex items-center gap-3 rounded-xl bg-black/20 p-3 text-sm hover:bg-black/30">
                  <Bot className={activeRules.length ? "size-5 text-moss" : "size-5 text-stone"} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-white">Autopilot {activeRules.length ? "on" : "off"}</span>
                    <span className="block text-xs text-stone">{activeRules.length ? `${activeRules.length} rule${activeRules.length === 1 ? "" : "s"}: ${activeRules.map((r) => r.name).join(", ")}` : "Reply to comments automatically"}</span>
                  </span>
                </Link>
              )}
            </GlassCard>
          </div>

          <GlassCard className="mt-4">
            <CardTitle icon={<Users />} description={meta.can.importPosts ? "Posts made in Verdant plus recent posts imported from the platform." : "Posts published through Verdant."}>
              Posts
            </CardTitle>
            {posts.length === 0 ? (
              <EmptyState title="No posts yet" description="Publish something, or wait for the next sync to import recent posts." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {posts.map((p) => (
                  <li key={p.id} className="flex gap-3 rounded-xl bg-black/20 p-3">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-white/5 text-stone">
                        <PlatformIcon platform={platform} className="size-6" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-mist">{p.text || "(no caption)"}</p>
                      <p className="mt-1 text-[11px] text-stone">
                        {timeAgo(p.publishedAt)} · {p.source === "imported" ? "from platform" : "via Verdant"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fog">
                        {Object.entries(p.metrics).map(([k, v]) => (
                          <span key={k} className="capitalize">
                            <span className="font-semibold text-white">{fmt(v)}</span> {k.replace(/_/g, " ")}
                          </span>
                        ))}
                        {Object.keys(p.metrics).length === 0 && <span className="text-stone">Metrics pending</span>}
                      </div>
                      <div className="mt-2 flex gap-3 text-xs">
                        {canComment && (
                          <Link href={`/channels/${platform}?post=${p.id}#comments`} scroll={false} className="inline-flex items-center gap-1 text-moss hover:underline">
                            <MessageCircle className="size-3.5" /> {p.comments} comment{p.comments === 1 ? "" : "s"}
                            {p.openComments ? ` · ${p.openComments} new` : ""}
                          </Link>
                        )}
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fog hover:text-white">
                            Open <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <section id="comments" className="mt-6 scroll-mt-20">
            <h2 className="mb-1 text-lg font-semibold text-white">Comments</h2>
            {canComment ? (
              <>
                <p className="mb-3 text-sm text-fog">
                  {filteredPost ? (
                    <>
                      On “{(filteredPost.text ?? "(no caption)").slice(0, 80)}” ·{" "}
                      <Link href={`/channels/${platform}#comments`} scroll={false} className="text-moss hover:underline">
                        show all posts
                      </Link>
                    </>
                  ) : (
                    `Reply here and it posts on ${meta.label} as your account.`
                  )}
                </p>
                <Inbox platforms={[platform]} fixedPlatform={platform} initialPostId={postId} />
              </>
            ) : (
              <GlassCard>
                <p className="text-sm text-fog">{meta.label} doesn&apos;t offer a comments API, so comments can&apos;t be read or answered here. Open a post above to reply on {meta.label}.</p>
              </GlassCard>
            )}
          </section>
        </>
      )}
    </>
  );
}
