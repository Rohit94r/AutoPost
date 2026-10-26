import Link from "next/link";
import { JobsList, type JobRow } from "@/components/jobs/jobs-list";
import { RetryFailed } from "@/components/jobs/retry-all";
import { PageHeader } from "@/components/ui/misc";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { getContent } from "@/server/content/service";
import { listJobs, listJobsQuery } from "@/server/publishing/service";

export const metadata = { title: "Publishing history" };
export const dynamic = "force-dynamic";

const FILTERS = [
  ["", "All"],
  ["published", "Published"],
  ["failed,needs_reconnection", "Failed"],
  ["cancelled", "Cancelled"],
] as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ content?: string; status?: string; platform?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const contentId = sp.content && /^[0-9a-f-]{36}$/i.test(sp.content) ? sp.content : null;
  const content = contentId ? await getContent(ctx.workspace.id, contentId).catch(() => null) : null;
  const platform = PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : undefined;

  let items: JobRow[];
  if (content) {
    items = content.jobs.map((j) => ({ ...j, preview: content.variants.find((v) => v.id === j.variantId)?.body ?? "", content: { id: content.id, title: content.title }, account: { displayName: j.account.displayName, username: j.account.username } })) as unknown as JobRow[];
  } else {
    const r = await listJobs(ctx.workspace.id, listJobsQuery.parse({ status: sp.status || "published,failed,cancelled,needs_reconnection,processing,queued", platform, order: "desc", pageSize: 100 }));
    items = r.items as unknown as JobRow[];
  }
  const hasFailures = content?.jobs.some((j) => j.status === "failed");

  return (
    <>
      <PageHeader
        eyebrow="Publishing"
        title={content ? content.title : "Publishing history"}
        description={content ? "Each destination is tracked on its own. Retry only touches failed ones." : "Every destination's outcome, with the platform's real response."}
        actions={content && hasFailures ? <RetryFailed contentId={content.id} /> : undefined}
      />
      {!content && (
        <div className="mb-4 flex flex-wrap gap-2">
          <nav className="inline-flex gap-1 rounded-xl bg-black/25 p-1" aria-label="Status filter">
            {FILTERS.map(([s, label]) => (
              <Link key={label} href={`/history?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(platform ? { platform } : {}) })}`} className={cn("rounded-lg px-3 py-1.5 text-sm", (sp.status ?? "") === s ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
                {label}
              </Link>
            ))}
          </nav>
          <nav className="inline-flex gap-1 rounded-xl bg-black/25 p-1" aria-label="Platform filter">
            {[undefined, ...PLATFORMS].map((p) => (
              <Link key={p ?? "all"} href={`/history?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(p ? { platform: p } : {}) })}`} className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", platform === p ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
                {p ?? "All platforms"}
              </Link>
            ))}
          </nav>
        </div>
      )}
      {content && (
        <p className="mb-3 text-sm">
          <Link href="/history" className="text-moss hover:underline">
            ← All history
          </Link>
        </p>
      )}
      <JobsList items={JSON.parse(JSON.stringify(items)) as JobRow[]} timezone={ctx.workspace.timezone} mode="history" emptyText="No publishing activity yet" />
    </>
  );
}
