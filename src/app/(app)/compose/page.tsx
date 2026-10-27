import { and, eq, ne } from "drizzle-orm";
import { Composer, type ComposerInitial } from "@/components/composer/composer";
import { PageHeader } from "@/components/ui/misc";
import type { Platform } from "@/lib/platforms";
import { suggestedScheduleLocal } from "@/lib/time";
import { requirePageContext } from "@/server/auth/session";
import { listBrands } from "@/server/brand/service";
import { getContent } from "@/server/content/service";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { backgroundMode, env, integrationStatus } from "@/server/env";
import { lastTickAt } from "@/server/jobs/runner";

export const metadata = { title: "Create post" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ id?: string; start?: string; document?: string }> }) {
  const ctx = await requirePageContext();
  const { id, start, document } = await searchParams;
  const documentId = document && UUID.test(document) ? document : null;
  const [accounts, brands, existing] = await Promise.all([
    db
      .select({ id: socialAccounts.id, platform: socialAccounts.platform, displayName: socialAccounts.displayName, username: socialAccounts.username, avatarUrl: socialAccounts.avatarUrl, status: socialAccounts.status, lastError: socialAccounts.lastError })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.workspaceId, ctx.workspace.id), ne(socialAccounts.status, "disconnected"))),
    listBrands(ctx.workspace.id),
    id && UUID.test(id) ? getContent(ctx.workspace.id, id).catch(() => null) : null,
  ]);

  const initial: ComposerInitial = existing
    ? {
        id: existing.id,
        title: existing.title,
        body: existing.body,
        linkUrl: existing.linkUrl,
        hashtags: existing.hashtags,
        callToAction: existing.callToAction,
        campaign: existing.campaign,
        tags: existing.tags,
        brandProfileId: existing.brandProfileId,
        media: existing.media.map((m) => ({ ...m, createdAt: undefined })) as ComposerInitial["media"],
        variants: Object.fromEntries(existing.variants.map((v) => [v.platform, { body: v.body, hashtags: v.hashtags, includeMedia: v.includeMedia, aiGenerated: v.aiGenerated }])) as ComposerInitial["variants"],
        jobs: existing.jobs.map((j) => ({
          id: j.id,
          platform: j.platform as Platform,
          status: j.status,
          scheduledAt: j.scheduledAt.toISOString(),
          timezone: j.timezone,
          publishedUrl: j.publishedUrl,
          lastErrorMessage: j.lastErrorMessage,
          lastErrorCode: j.lastErrorCode,
          account: { id: j.account.id, displayName: j.account.displayName },
        })),
        status: existing.status,
      }
    : { id: null, title: "", body: "", linkUrl: null, hashtags: [], callToAction: null, campaign: null, tags: [], brandProfileId: null, media: [], variants: {}, jobs: [], status: "draft" };

  const integrations = integrationStatus();
  const e = env();
  return (
    <>
      <PageHeader eyebrow="Composer" title={existing ? "Edit post" : "Create a post"} description="Write it yourself or start from a document. AI shapes it for each platform, you preview it, then publish or schedule." />
      <Composer
        key={existing?.id ?? "new"}
        initial={initial}
        accounts={accounts}
        brands={brands.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))}
        timezone={ctx.workspace.timezone}
        defaultScheduleLocal={suggestedScheduleLocal(ctx.workspace.timezone)}
        xMaxLength={e.X_MAX_POST_LENGTH}
        aiAvailable={integrations.groq || integrations.gemini}
        startWith={documentId || start === "document" ? "document" : start === "image" ? "image" : null}
        initialDocumentId={documentId}
        schedulerWarning={await schedulerWarning(integrations.redis)}
        documents={{ maxMb: e.DOCUMENT_MAX_MB, retentionDays: ctx.workspace.documentRetentionDays, aiReady: integrations.gemini || Boolean(e.AI_MODEL_EXTRACT) }}
      />
    </>
  );
}

/** Explain, in plain words, when posts won't go out on time. */
async function schedulerWarning(redis: boolean): Promise<string | null> {
  if (backgroundMode() === "worker") return redis ? null : "Publishing runs in the background worker, which needs Redis (REDIS_URL) and `pnpm worker`. Until then, posts are saved and queued but not sent.";
  const last = await lastTickAt();
  if (last && Date.now() - last.getTime() < 15 * 60_000) return null;
  return `"Publish now" sends right away. Scheduled posts go out when the scheduler runs, and it ${last ? "hasn't run in the last 15 minutes" : "hasn't run yet"}. Set it up under Get started.`;
}
