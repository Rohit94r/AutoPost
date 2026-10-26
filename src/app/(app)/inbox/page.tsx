import { and, eq, inArray } from "drizzle-orm";
import { Bot, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Autopilot, type Rule } from "@/components/autopilot/autopilot";
import { Inbox } from "@/components/inbox/inbox";
import { PageHeader } from "@/components/ui/misc";
import { isPlatform, PLATFORM_META, PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { listBrands } from "@/server/brand/service";
import { connectedPlatforms } from "@/server/channels/service";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { listRules } from "@/server/engagement/service";
import { env } from "@/server/env";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/** Inbox = every comment and mention (reply by hand) + Autopilot rules (reply automatically). */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; platform?: string; post?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const tab = sp.tab === "autopilot" ? "autopilot" : "comments";
  const connected = await connectedPlatforms(ctx.workspace.id);
  const open = connected.reduce((s, c) => s + c.open, 0);
  const rules = await listRules(ctx.workspace.id);
  const activeRules = rules.filter((r) => r.enabled).length;

  return (
    <>
      <PageHeader
        eyebrow="Engagement"
        title="Inbox"
        description={
          tab === "comments"
            ? `Every comment and mention across your apps. Reply here and it posts on the platform.${env().ENGAGEMENT_X_ENABLED ? "" : " X replies are off by default because each read is billed (ENGAGEMENT_X_ENABLED)."}`
            : "Answer comments and mentions in your voice, automatically or as drafts you approve here in the Inbox."
        }
      />
      <nav className="mb-4 inline-flex gap-1 rounded-xl bg-black/25 p-1" aria-label="Inbox sections">
        {[
          { key: "comments", href: "/inbox", label: "Comments", Icon: MessageCircle, badge: open ? String(open) : null, badgeClass: "bg-dawn/90 text-ink" },
          { key: "autopilot", href: "/inbox?tab=autopilot", label: "Autopilot", Icon: Bot, badge: activeRules ? `${activeRules} on` : null, badgeClass: "bg-moss/20 text-moss" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm", tab === t.key ? "bg-white/12 text-white" : "text-fog hover:text-white")}
          >
            <t.Icon className="size-4" /> {t.label}
            {t.badge && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", t.badgeClass)}>{t.badge}</span>}
          </Link>
        ))}
      </nav>

      {tab === "comments" ? (
        <Inbox
          platforms={PLATFORMS.filter((p) => connected.some((c) => c.platform === p) && PLATFORM_META[p].can.comments !== "none")}
          initialPlatform={isPlatform(sp.platform) ? sp.platform : undefined}
          initialPostId={sp.post && /^[0-9a-f-]{36}$/i.test(sp.post) ? sp.post : undefined}
        />
      ) : (
        <AutopilotTab workspaceId={ctx.workspace.id} rules={rules} />
      )}
    </>
  );
}

async function AutopilotTab({ workspaceId, rules }: { workspaceId: string; rules: Awaited<ReturnType<typeof listRules>> }) {
  const replyable = PLATFORMS.filter((p) => PLATFORM_META[p].can.comments === "read_reply");
  const [accounts, brands] = await Promise.all([
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, workspaceId), eq(socialAccounts.status, "connected"), inArray(socialAccounts.platform, replyable))),
    listBrands(workspaceId),
  ]);
  return <Autopilot rules={JSON.parse(JSON.stringify(rules)) as Rule[]} accounts={accounts} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />;
}
