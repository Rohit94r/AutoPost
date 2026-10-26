import { ExternalLink, Eye, Heart, MessageCircle, PenSquare, Repeat2, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardTitle, EmptyState, GlassCard, PageHeader, Stat } from "@/components/ui/misc";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { isPlatform, PLATFORM_META } from "@/lib/platforms";
import { timeAgo } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { channelOverview } from "@/server/channels/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  return { title: isPlatform(platform) ? PLATFORM_META[platform].label : "Channel" };
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n));
const STAT_LABEL: Record<string, string> = { followers: "Followers", following: "Following", posts: "Posts", views: "Views", likes: "Likes", karma: "Karma", monthlyViews: "Monthly views" };

export default async function ChannelPage({ params }: { params: Promise<{ platform: string }> }) {
  const ctx = await requirePageContext();
  const { platform } = await params;
  if (!isPlatform(platform)) notFound();
  const meta = PLATFORM_META[platform];
  const { accounts, posts, totals } = await channelOverview(ctx.workspace.id, platform);

  return (
    <>
      <PageHeader
        eyebrow="Channel"
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
            {meta.can.comments !== "none" && (
              <Button asChild variant="glass">
                <Link href={`/inbox?platform=${platform}`}>
                  <MessageCircle /> Comments {totals.openComments ? `(${totals.openComments})` : ""}
                </Link>
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
          <EmptyState icon={<PlatformIcon platform={platform} className="size-6" />} title={`No ${meta.label} account connected`} description="Connect one to see its posts, comments and analytics here." action={<Button asChild><Link href="/accounts">Connect {meta.label}</Link></Button>} />
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
            <Stat label="Comments" value={totals.comments} hint={totals.openComments ? `${totals.openComments} waiting` : "All handled"} icon={<MessageCircle />} tone={totals.openComments ? "warn" : "default"} />
            <Stat label="Likes" value={fmt(totals.likes)} icon={<Heart />} hint={totals.likes === null ? "Not available yet" : undefined} />
            <Stat label="Views" value={fmt(totals.views)} icon={<Eye />} hint={totals.views === null ? "Not available yet" : undefined} />
            <Stat label="Shares" value={fmt(totals.shares)} icon={<Repeat2 />} hint={totals.shares === null ? "Not available yet" : undefined} />
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
                        {meta.can.comments !== "none" && (
                          <Link href={`/inbox?platform=${platform}&post=${p.id}`} className="inline-flex items-center gap-1 text-moss hover:underline">
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
        </>
      )}
    </>
  );
}
