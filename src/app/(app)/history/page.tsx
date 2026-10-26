import { Film, Library, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { ContentActions, MediaActions } from "@/components/history/actions";
import { JobsList, type JobRow } from "@/components/jobs/jobs-list";
import { RetryFailed } from "@/components/jobs/retry-all";
import { Button } from "@/components/ui/button";
import { EmptyState, GlassCard, PageHeader } from "@/components/ui/misc";
import { Badge, PlatformBadge, StatusBadge } from "@/components/ui/platform";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { getContent, listContent, listQuery } from "@/server/content/service";
import { listMedia } from "@/server/media/service";
import { listJobs, listJobsQuery } from "@/server/publishing/service";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

/** History = every post you've made (drafts → published), the per-destination publishing log, and your media. */
const TABS = [
  ["posts", "Posts"],
  ["activity", "Publishing log"],
  ["media", "Media"],
] as const;
type Tab = (typeof TABS)[number][0];

const POST_VIEWS = [
  ["all", "All"],
  ["drafts", "Drafts"],
  ["published", "Published"],
  ["ai", "AI-generated"],
  ["templates", "Templates"],
  ["archived", "Archived"],
] as const;

const LOG_FILTERS = [
  ["", "All"],
  ["published", "Published"],
  ["failed,needs_reconnection", "Failed"],
  ["cancelled", "Cancelled"],
] as const;

type SP = Record<string, string | undefined>;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  // ?content=… (from the composer) or log filters open the publishing log
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : sp.content || sp.status || sp.platform ? "activity" : "posts";

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Everything you've made"
        description="Drafts, published posts and each platform's real response, all in one place."
        actions={
          <Button asChild>
            <Link href="/compose">New post</Link>
          </Button>
        }
      />
      <nav className="mb-4 inline-flex gap-1 rounded-xl bg-black/25 p-1" aria-label="History sections">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/history?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("rounded-lg px-4 py-1.5 text-sm", tab === t ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "posts" && <Posts workspaceId={ctx.workspace.id} sp={sp} />}
      {tab === "activity" && <Activity workspaceId={ctx.workspace.id} timezone={ctx.workspace.timezone} sp={sp} />}
      {tab === "media" && <Media workspaceId={ctx.workspace.id} />}
    </>
  );
}

async function Posts({ workspaceId, sp }: { workspaceId: string; sp: SP }) {
  const view = POST_VIEWS.some(([v]) => v === sp.view) ? sp.view! : "all";
  const q = listQuery.parse({ view, q: sp.q || undefined, page: sp.page, tag: sp.tag || undefined, campaign: sp.campaign || undefined });
  const content = await listContent(workspaceId, q);
  const pages = Math.max(1, Math.ceil(content.total / content.pageSize));
  const href = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams({ tab: "posts" });
    for (const [k, v] of Object.entries({ view, q: sp.q, tag: sp.tag, campaign: sp.campaign, ...o })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/history?${p}`;
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="inline-flex flex-wrap gap-1 rounded-xl bg-black/25 p-1" aria-label="Post filters">
          {POST_VIEWS.map(([v, label]) => (
            <Link key={v} href={href({ view: v, page: undefined })} aria-current={view === v ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", view === v ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="glass-input flex h-10 items-center gap-2 px-3 md:w-72" action="/history">
          <Search className="size-4 text-stone" />
          <input type="hidden" name="tab" value="posts" />
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={sp.q} placeholder="Search title, text, campaign" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-stone" aria-label="Search" />
        </form>
      </div>

      {(sp.tag || sp.campaign) && (
        <p className="mb-3 text-sm text-fog">
          Filtered by {sp.campaign ? `campaign "${sp.campaign}"` : `tag #${sp.tag}`} ·{" "}
          <Link href={href({ tag: undefined, campaign: undefined, page: undefined })} className="text-moss hover:underline">
            clear
          </Link>
        </p>
      )}

      <GlassCard className="p-2">
        {content.items.length === 0 ? (
          <EmptyState icon={<Library />} title={sp.q ? "No matches" : "Nothing here yet"} description={sp.q ? "Try a different search." : "Posts you create will show up here."} />
        ) : (
          <ul className="divide-y divide-white/6">
            {content.items.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/compose?id=${c.id}`} className="truncate text-sm font-medium text-white hover:underline">
                      {c.title}
                    </Link>
                    {c.aiGenerated && <Sparkles className="size-3.5 shrink-0 text-sun" aria-label="AI-generated" />}
                  </div>
                  <p className="truncate text-xs text-stone">{c.body || "No main content"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {c.platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} size="sm" />
                    ))}
                    {c.campaign && (
                      <Link href={href({ campaign: c.campaign, page: undefined })}>
                        <Badge className="bg-sun/15 text-sun">{c.campaign}</Badge>
                      </Link>
                    )}
                    {c.tags.map((t) => (
                      <Link key={t} href={href({ tag: t, page: undefined })}>
                        <Badge>#{t}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <StatusBadge status={c.status} />
                  <p className="mt-1 text-xs text-stone">Updated {timeAgo(c.updatedAt)}</p>
                  {c.status !== "draft" && (
                    <Link href={`/history?content=${c.id}`} className="text-xs text-moss hover:underline">
                      Publishing log
                    </Link>
                  )}
                </div>
                <ContentActions id={c.id} archived={Boolean(c.archivedAt)} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {q.page > 1 && (
            <Link className="rounded-lg px-3 py-1.5 text-fog hover:bg-white/10" href={href({ page: q.page - 1 })}>
              ← Previous
            </Link>
          )}
          <span className="text-stone">
            Page {q.page} of {pages}
          </span>
          {q.page < pages && (
            <Link className="rounded-lg px-3 py-1.5 text-fog hover:bg-white/10" href={href({ page: q.page + 1 })}>
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

async function Activity({ workspaceId, timezone, sp }: { workspaceId: string; timezone: string; sp: SP }) {
  const contentId = sp.content && /^[0-9a-f-]{36}$/i.test(sp.content) ? sp.content : null;
  const content = contentId ? await getContent(workspaceId, contentId).catch(() => null) : null;
  const platform = PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : undefined;

  let items: JobRow[];
  if (content) {
    items = content.jobs.map((j) => ({ ...j, preview: content.variants.find((v) => v.id === j.variantId)?.body ?? "", content: { id: content.id, title: content.title }, account: { displayName: j.account.displayName, username: j.account.username } })) as unknown as JobRow[];
  } else {
    const r = await listJobs(workspaceId, listJobsQuery.parse({ status: sp.status || "published,failed,cancelled,needs_reconnection,processing,queued", platform, order: "desc", pageSize: 100 }));
    items = r.items as unknown as JobRow[];
  }
  const hasFailures = content?.jobs.some((j) => j.status === "failed");
  const logHref = (o: { status?: string; platform?: Platform }) => `/history?${new URLSearchParams({ tab: "activity", ...(o.status ? { status: o.status } : {}), ...(o.platform ? { platform: o.platform } : {}) })}`;

  return (
    <>
      {content ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/history?tab=activity" className="text-sm text-moss hover:underline">
              ← Full publishing log
            </Link>
            <h2 className="mt-1 text-lg font-semibold text-white">{content.title}</h2>
            <p className="text-sm text-fog">Each destination is tracked on its own. Retry only touches failed ones.</p>
          </div>
          {hasFailures && <RetryFailed contentId={content.id} />}
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          <nav className="inline-flex gap-1 rounded-xl bg-black/25 p-1" aria-label="Status filter">
            {LOG_FILTERS.map(([s, label]) => (
              <Link key={label} href={logHref({ status: s, platform })} className={cn("rounded-lg px-3 py-1.5 text-sm", (sp.status ?? "") === s ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
                {label}
              </Link>
            ))}
          </nav>
          <nav className="inline-flex flex-wrap gap-1 rounded-xl bg-black/25 p-1" aria-label="Platform filter">
            {[undefined, ...PLATFORMS].map((p) => (
              <Link key={p ?? "all"} href={logHref({ status: sp.status, platform: p })} className={cn("rounded-lg px-3 py-1.5 text-sm", platform === p ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
                {p ? PLATFORM_META[p].label : "All platforms"}
              </Link>
            ))}
          </nav>
        </div>
      )}
      <JobsList items={JSON.parse(JSON.stringify(items)) as JobRow[]} timezone={timezone} mode="history" emptyText="No publishing activity yet" />
    </>
  );
}

async function Media({ workspaceId }: { workspaceId: string }) {
  const media = await listMedia(workspaceId, { limit: 200 });
  return (
    <GlassCard>
      {media.length === 0 ? (
        <EmptyState icon={<Film />} title="No media yet" description="Upload images or videos, or create one with AI, from Create post." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {media.map((m) => (
            <li key={m.id} className="group relative overflow-hidden rounded-xl bg-black/30">
              <div className="aspect-square">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnailUrl ?? m.url} alt={m.altText ?? m.originalFilename} className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-fog">
                    <Film className="size-7" />
                  </div>
                )}
              </div>
              <div className="p-2 text-[11px] text-stone">
                <p className="truncate text-fog">{m.originalFilename}</p>
                {formatBytes(m.sizeBytes)}
                {m.width ? ` · ${m.width}×${m.height}` : ""}
              </div>
              <div className="absolute right-1.5 top-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <MediaActions id={m.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
