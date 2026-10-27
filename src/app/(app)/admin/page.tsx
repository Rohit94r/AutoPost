import { notFound } from "next/navigation";
import { CardTitle, GlassCard, PageHeader, Stat } from "@/components/ui/misc";
import { PlatformBadge, StatusBadge } from "@/components/ui/platform";
import { timeAgo } from "@/lib/utils";
import { adminOverview, isAdmin } from "@/server/admin/service";
import { requirePageContext } from "@/server/auth/session";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const ctx = await requirePageContext();
  if (!isAdmin(ctx.user.email)) notFound();
  const o = await adminOverview();
  const n = (s: string) => o.jobs.find((j) => j.status === s)?.n ?? 0;
  return (
    <>
      <PageHeader eyebrow="Operations" title="Admin overview" description="Cross-tenant health. No content or credentials are shown here." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Users" value={o.users} />
        <Stat label="Workspaces" value={o.workspaces} />
        <Stat label="Waiting" value={n("queued") + n("scheduled")} />
        <Stat label="Processing" value={n("processing")} tone={n("processing") ? "warn" : "default"} />
        <Stat label="Failed" value={n("failed") + n("needs_reconnection")} tone="bad" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardTitle>Queues (BullMQ)</CardTitle>
          {o.queues ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-stone">
                <tr>
                  <th className="py-1 text-left font-normal">Queue</th>
                  {["waiting", "active", "delayed", "failed"].map((h) => (
                    <th key={h} className="text-right font-normal capitalize">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(o.queues).map(([q, c]) => (
                  <tr key={q} className="border-t border-white/6">
                    <td className="py-1.5 text-mist">{q.replace("flowt-", "")}</td>
                    {["waiting", "active", "delayed", "failed"].map((h) => (
                      <td key={h} className="text-right tabular-nums text-white">
                        {c[h] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-sun">Redis is not configured or unreachable.</p>
          )}
        </GlassCard>
        <GlassCard>
          <CardTitle>Integrations & AI (24h)</CardTitle>
          <div className="flex flex-wrap gap-2">
            {Object.entries(o.integrations).map(([k, v]) => (
              <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs ${v ? "bg-emerald-400/15 text-emerald-200" : "bg-white/8 text-stone"}`}>
                {k}: {v ? "on" : "off"}
              </span>
            ))}
          </div>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {o.ai24h.map((r) => (
                <tr key={`${r.provider}${r.status}`} className="border-t border-white/6">
                  <td className="py-1.5 text-mist">{r.provider}</td>
                  <td>{r.status}</td>
                  <td className="text-right tabular-nums">{r.n} calls</td>
                  <td className="text-right tabular-nums text-fog">{r.avgLatency} ms avg</td>
                </tr>
              ))}
              {o.ai24h.length === 0 && (
                <tr>
                  <td className="py-2 text-fog">No AI calls in the last 24 hours.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-stone">
            Routes: {Object.entries(o.ai.routes).map(([t, r]) => `${t}→${r.provider}:${r.model}`).join(" · ")}
          </p>
        </GlassCard>
      </div>
      <GlassCard className="mt-4">
        <CardTitle>Recent failures</CardTitle>
        <ul className="divide-y divide-white/6">
          {o.recentFailures.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
              <PlatformBadge platform={f.platform} size="sm" />
              <StatusBadge status={f.code === "auth" ? "needs_reconnection" : "failed"} />
              <span className="min-w-0 flex-1 truncate text-fog">{f.message}</span>
              <code className="text-xs text-stone">{f.correlationId.slice(0, 8)}</code>
              <span className="text-xs text-stone">{timeAgo(f.updatedAt)}</span>
            </li>
          ))}
          {o.recentFailures.length === 0 && <li className="py-3 text-sm text-fog">No failures. 🌿</li>}
        </ul>
      </GlassCard>
    </>
  );
}
