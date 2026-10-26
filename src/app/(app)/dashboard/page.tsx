import { AlertTriangle, CalendarClock, CheckCircle2, FileScan, Link2, PenSquare, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardTitle, EmptyState, GlassCard, PageHeader, Stat } from "@/components/ui/misc";
import { PlatformBadge, StatusBadge } from "@/components/ui/platform";
import { formatInZone } from "@/lib/time";
import { formatBytes, timeAgo } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { dashboardData } from "@/server/dashboard/service";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "Dashboard" };

const ACTION_LABEL: Record<string, string> = {
  "content.created": "created a post",
  "content.deleted": "deleted a draft",
  "content.archived": "archived a post",
  "publishing.requested": "published a post",
  "publishing.scheduled": "scheduled a post",
  "publishing.cancelled": "cancelled a destination",
  "publishing.rescheduled": "rescheduled a destination",
  "publishing.retried": "retried a destination",
  "social_account.connected": "connected an account",
  "social_account.disconnected": "disconnected an account",
  "media.uploaded": "uploaded media",
  "document.uploaded": "uploaded a document",
  "workspace.updated": "updated workspace settings",
};

export default async function DashboardPage() {
  const ctx = await requirePageContext();
  const d = await dashboardData(ctx.workspace.id);
  const ai = d.usage.items.find((i) => i.key === "ai")!;
  const integrations = integrationStatus();
  const hour = Number(formatInZone(new Date(), ctx.workspace.timezone, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={ctx.workspace.name}
        title={`${greeting}, ${ctx.user.name.split(" ")[0]}`}
        description="Here's what's happening across your channels."
        actions={
          <>
            <Button asChild variant="glass">
              <Link href="/documents">
                <FileScan /> From a document
              </Link>
            </Button>
            <Button asChild>
              <Link href="/compose">
                <PenSquare /> Quick create
              </Link>
            </Button>
          </>
        }
      />

      {!integrations.groq && !integrations.gemini && (
        <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          AI providers aren&apos;t configured on this server yet. Add <code>GROQ_API_KEY</code> and/or <code>GEMINI_API_KEY</code> to enable writing and document features.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Connected" value={d.accounts.filter((a) => a.status === "connected").length} hint={`${d.accounts.length} account${d.accounts.length === 1 ? "" : "s"} total`} icon={<Link2 />} />
        <Stat label="Scheduled" value={d.stats.scheduled} hint={d.stats.processing ? `${d.stats.processing} publishing now` : "Waiting to go out"} icon={<CalendarClock />} />
        <Stat label="Published" value={d.stats.published} hint="Confirmed by platforms" icon={<CheckCircle2 />} tone="good" />
        <Stat label="Failed" value={d.stats.failed} hint={d.stats.failed ? "Needs attention" : "All clear"} icon={<XCircle />} tone={d.stats.failed ? "bad" : "default"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardTitle icon={<CalendarClock />} description={`Times shown in ${ctx.workspace.timezone}`} action={<Link href="/calendar" className="text-sm text-moss hover:underline">Calendar →</Link>}>
            Upcoming
          </CardTitle>
          {d.upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Schedule a post and it will show up here." action={<Button asChild size="sm"><Link href="/compose">Schedule a post</Link></Button>} />
          ) : (
            <ul className="divide-y divide-white/6">
              {d.upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <PlatformBadge platform={u.platform} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/compose?id=${u.contentId}`} className="block truncate text-sm text-white hover:underline">
                      {u.title}
                    </Link>
                    <p className="text-xs text-stone">{u.account}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-mist">{formatInZone(u.scheduledAt, ctx.workspace.timezone, "EEE d MMM, HH:mm")}</p>
                    <StatusBadge status={u.status} className="mt-0.5" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <CardTitle icon={<Sparkles />}>AI usage this month</CardTitle>
            <Meter used={ai.used} limit={ai.limit} />
            <p className="mt-2 text-sm text-fog">
              {Math.max(0, ai.limit - ai.used).toLocaleString()} of {ai.limit.toLocaleString()} requests left on the <span className="capitalize">{d.usage.plan}</span> plan.
            </p>
            <div className="mt-4 space-y-2 text-xs text-stone">
              {d.usage.items
                .filter((i) => i.key !== "ai")
                .map((i) => (
                  <div key={i.key} className="flex justify-between">
                    <span>{i.label}</span>
                    <span className="text-fog">
                      {i.unit === "bytes" ? formatBytes(i.used) : i.used} / {i.unit === "bytes" ? formatBytes(i.limit) : i.limit}
                    </span>
                  </div>
                ))}
            </div>
          </GlassCard>

          <GlassCard>
            <CardTitle icon={<Link2 />} action={<Link href="/accounts" className="text-sm text-moss hover:underline">Manage →</Link>}>
              Accounts
            </CardTitle>
            {d.accounts.length === 0 ? (
              <p className="text-sm text-fog">
                No accounts yet.{" "}
                <Link href="/accounts" className="text-moss hover:underline">
                  Connect one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2.5">
                {d.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <PlatformBadge platform={a.platform} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-mist">{a.displayName}</span>
                    {a.status !== "connected" ? <AlertTriangle className="size-4 text-sun" aria-label={a.status} /> : <span className="size-2 rounded-full bg-moss" aria-label="connected" />}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassCard className="mt-4">
        <CardTitle>Recent activity</CardTitle>
        {d.recent.length === 0 ? (
          <p className="text-sm text-fog">Activity from your team will appear here.</p>
        ) : (
          <ul className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
            {d.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-mist">
                  <span className="text-white">{r.actor ?? "System"}</span> {ACTION_LABEL[r.action] ?? r.action.replace(/[._]/g, " ")}
                </span>
                <span className="shrink-0 text-xs text-stone">{timeAgo(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </>
  );
}

function Meter({ used, limit }: { used: number; limit: number }) {
  const p = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit} aria-label="AI usage">
      <div className={`h-full rounded-full ${p > 90 ? "bg-dawn" : p > 70 ? "bg-sun" : "bg-linear-to-r from-moss to-moss-strong"}`} style={{ width: `${p}%` }} />
    </div>
  );
}
