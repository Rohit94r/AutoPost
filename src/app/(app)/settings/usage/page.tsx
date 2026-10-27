import { SettingsNav } from "@/components/settings/settings-nav";
import { CardTitle, GlassCard, Notice, PageHeader } from "@/components/ui/misc";
import { PLANS, type PlanId } from "@/lib/plans";
import { formatBytes } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { usageSummary } from "@/server/usage/service";

export const metadata = { title: "Usage & plan" };

export default async function UsagePage() {
  const ctx = await requirePageContext();
  const u = await usageSummary(ctx.workspace.id);
  const plan = PLANS[(u.plan as PlanId) ?? "free"] ?? PLANS.free;
  const fmt = (n: number, unit?: string) => (unit === "bytes" ? formatBytes(n) : n.toLocaleString());
  return (
    <>
      <PageHeader eyebrow="Settings" title="Usage & plan" description={`Billing period started ${new Date(u.periodStart).toUTCString().slice(5, 16)} (UTC). Limits are enforced on the server.`} />
      <SettingsNav />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlassCard>
          <CardTitle>This month</CardTitle>
          <ul className="space-y-5">
            {u.items.map((i) => {
              const p = Math.min(100, (i.used / Math.max(1, i.limit)) * 100);
              return (
                <li key={i.key}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-mist">{i.label}</span>
                    <span className="tabular-nums text-fog">
                      {fmt(i.used, i.unit)} / {fmt(i.limit, i.unit)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={i.label} aria-valuenow={i.used} aria-valuemin={0} aria-valuemax={i.limit}>
                    <div className={`h-full rounded-full ${p > 90 ? "bg-dawn" : p > 70 ? "bg-sun" : "bg-moss-strong"}`} style={{ width: `${p}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-xs text-stone">AI tokens reported by providers this month: {u.aiTokens.toLocaleString()}</p>
        </GlassCard>
        <GlassCard strong>
          <p className="text-xs uppercase tracking-wider text-stone">Current plan</p>
          <h2 className="mt-1 font-display text-4xl text-white">{plan.name}</h2>
          <p className="mt-1 text-sm text-fog">{plan.description}</p>
          <Notice tone="info" className="mt-5">
            Online payments aren&apos;t enabled yet. To change plans, contact your FLOWT administrator. No card is ever requested in-app.
          </Notice>
        </GlassCard>
      </div>
    </>
  );
}
