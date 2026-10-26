import { and, eq, inArray } from "drizzle-orm";
import { Autopilot, type Rule } from "@/components/autopilot/autopilot";
import { PageHeader } from "@/components/ui/misc";
import { PLATFORM_META, PLATFORMS } from "@/lib/platforms";
import { requirePageContext } from "@/server/auth/session";
import { listBrands } from "@/server/brand/service";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { listRules } from "@/server/engagement/service";

export const metadata = { title: "Autopilot" };
export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const ctx = await requirePageContext();
  const replyable = PLATFORMS.filter((p) => PLATFORM_META[p].can.comments === "read_reply");
  const [rules, accounts, brands] = await Promise.all([
    listRules(ctx.workspace.id),
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, ctx.workspace.id), eq(socialAccounts.status, "connected"), inArray(socialAccounts.platform, replyable))),
    listBrands(ctx.workspace.id),
  ]);
  return (
    <>
      <PageHeader eyebrow="Engagement" title="Autopilot" description="Answer comments and mentions in your voice, automatically or as drafts for your approval." />
      <Autopilot rules={JSON.parse(JSON.stringify(rules)) as Rule[]} accounts={accounts} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
    </>
  );
}
