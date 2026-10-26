import { Inbox } from "@/components/inbox/inbox";
import { PageHeader } from "@/components/ui/misc";
import { isPlatform, PLATFORM_META, PLATFORMS } from "@/lib/platforms";
import { requirePageContext } from "@/server/auth/session";
import { connectedPlatforms } from "@/server/channels/service";
import { env } from "@/server/env";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ platform?: string; post?: string }> }) {
  const ctx = await requirePageContext();
  const sp = await searchParams;
  const connected = (await connectedPlatforms(ctx.workspace.id)).map((c) => c.platform);
  const list = PLATFORMS.filter((p) => connected.includes(p) && PLATFORM_META[p].can.comments !== "none");
  return (
    <>
      <PageHeader
        eyebrow="Engagement"
        title="Inbox"
        description={`Every comment and mention across your accounts, in one place. Reply here and it posts on the platform.${env().ENGAGEMENT_X_ENABLED ? "" : " X replies are off by default because each read is billed (ENGAGEMENT_X_ENABLED)."}`}
      />
      <Inbox platforms={list} initialPlatform={isPlatform(sp.platform) ? sp.platform : undefined} initialPostId={sp.post && /^[0-9a-f-]{36}$/i.test(sp.post) ? sp.post : undefined} />
    </>
  );
}
