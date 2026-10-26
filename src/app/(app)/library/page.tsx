import { Film, Library, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { ContentActions, MediaActions } from "@/components/library/actions";
import { Button } from "@/components/ui/button";
import { EmptyState, GlassCard, PageHeader } from "@/components/ui/misc";
import { Badge, PlatformBadge, StatusBadge } from "@/components/ui/platform";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { listContent, listQuery } from "@/server/content/service";
import { listMedia } from "@/server/media/service";

export const metadata = { title: "Library" };

const VIEWS = [
  ["all", "All"],
  ["drafts", "Drafts"],
  ["published", "Published"],
  ["ai", "AI-generated"],
  ["templates", "Templates"],
  ["archived", "Archived"],
  ["media", "Media"],
] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : "all";
  const q = listQuery.parse({ view: view === "media" ? "all" : view, q: sp.q || undefined, page: sp.page, tag: sp.tag || undefined, campaign: sp.campaign || undefined });
  const [content, media] = await Promise.all([view === "media" ? null : listContent(ctx.workspace.id, q), view === "media" ? listMedia(ctx.workspace.id, { limit: 200 }) : null]);
  const pages = content ? Math.max(1, Math.ceil(content.total / content.pageSize)) : 1;
  const href = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, q: sp.q, tag: sp.tag, campaign: sp.campaign, ...o })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/library?${p}`;
  };

  return (
    <>
      <PageHeader eyebrow="Content library" title="Everything you've made" actions={<Button asChild><Link href="/compose">New post</Link></Button>} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="inline-flex flex-wrap gap-1 rounded-xl bg-black/25 p-1" aria-label="Library views">
          {VIEWS.map(([v, label]) => (
            <Link key={v} href={href({ view: v, page: undefined })} aria-current={view === v ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", view === v ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
              {label}
            </Link>
          ))}
        </nav>
        {view !== "media" && (
          <form className="glass-input flex h-10 items-center gap-2 px-3 md:w-72" action="/library">
            <Search className="size-4 text-stone" />
            <input type="hidden" name="view" value={view} />
            <input name="q" defaultValue={sp.q} placeholder="Search title, text, campaign" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-stone" aria-label="Search" />
          </form>
        )}
      </div>

      {media && (
        <GlassCard>
          {media.length === 0 ? (
            <EmptyState icon={<Film />} title="No media yet" description="Upload images or videos from the composer." />
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
      )}

      {content && (
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
                  </div>
                  <ContentActions id={c.id} archived={Boolean(c.archivedAt)} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      )}

      {content && pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {q.page > 1 && <Link className="rounded-lg px-3 py-1.5 text-fog hover:bg-white/10" href={href({ page: q.page - 1 })}>← Previous</Link>}
          <span className="text-stone">
            Page {q.page} of {pages}
          </span>
          {q.page < pages && <Link className="rounded-lg px-3 py-1.5 text-fog hover:bg-white/10" href={href({ page: q.page + 1 })}>Next →</Link>}
        </div>
      )}
    </>
  );
}
