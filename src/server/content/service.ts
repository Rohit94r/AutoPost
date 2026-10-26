import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { audit } from "@/server/audit";
import { db, type DbOrTx } from "@/server/db";
import { contentItems, contentMedia, contentVariants, mediaAssets, publishingJobs, socialAccounts } from "@/server/db/schema";
import { badRequest, conflict, notFound } from "@/server/errors";
import { serializeMedia } from "@/server/media/service";

const tag = z.string().trim().min(1).max(60);

export const variantInput = z.object({
  platform: z.enum(PLATFORMS),
  body: z.string().max(10_000).default(""),
  hashtags: z.array(tag).max(30).default([]),
  includeMedia: z.boolean().default(true),
  aiGenerated: z.boolean().default(false),
});

export const contentInput = z.object({
  title: z.string().trim().max(200).default("Untitled post"),
  body: z.string().max(10_000).default(""),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Links must be http(s)")
    .nullish(),
  hashtags: z.array(tag).max(30).default([]),
  callToAction: z.string().trim().max(300).nullish(),
  brandProfileId: z.string().uuid().nullish(),
  sourceDocumentId: z.string().uuid().nullish(),
  campaign: z.string().trim().max(100).nullish(),
  tags: z.array(tag).max(20).default([]),
  aiGenerated: z.boolean().default(false),
  isTemplate: z.boolean().default(false),
  mediaIds: z.array(z.string().uuid()).max(10).default([]),
  variants: z.array(variantInput).max(PLATFORMS.length).default([]),
});
export type ContentInput = z.infer<typeof contentInput>;

export const contentPatch = contentInput.partial();

async function assertMediaOwned(workspaceId: string, ids: string[], conn: DbOrTx) {
  if (!ids.length) return;
  const rows = await conn
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.workspaceId, workspaceId), inArray(mediaAssets.id, ids), isNull(mediaAssets.deletedAt)));
  if (rows.length !== new Set(ids).size) throw badRequest("One or more media items don't exist in this workspace.");
}

async function replaceMedia(contentId: string, ids: string[], conn: DbOrTx) {
  await conn.delete(contentMedia).where(eq(contentMedia.contentId, contentId));
  if (ids.length) await conn.insert(contentMedia).values([...new Set(ids)].map((mediaId, position) => ({ contentId, mediaId, position })));
}

async function upsertVariants(workspaceId: string, contentId: string, variants: z.infer<typeof variantInput>[], conn: DbOrTx) {
  for (const v of variants) {
    await conn
      .insert(contentVariants)
      .values({ workspaceId, contentId, platform: v.platform, body: v.body, hashtags: v.hashtags, includeMedia: v.includeMedia, aiGenerated: v.aiGenerated })
      .onConflictDoUpdate({
        target: [contentVariants.contentId, contentVariants.platform],
        set: { body: v.body, hashtags: v.hashtags, includeMedia: v.includeMedia, aiGenerated: v.aiGenerated, updatedAt: new Date() },
      });
  }
}

export async function createContent(ctx: { workspaceId: string; userId: string }, input: ContentInput, conn: DbOrTx = db) {
  return conn.transaction(async (tx) => {
    await assertMediaOwned(ctx.workspaceId, input.mediaIds, tx);
    const [row] = await tx
      .insert(contentItems)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        title: input.title || "Untitled post",
        body: input.body,
        linkUrl: input.linkUrl ?? null,
        hashtags: input.hashtags,
        callToAction: input.callToAction ?? null,
        brandProfileId: input.brandProfileId ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        campaign: input.campaign ?? null,
        tags: input.tags,
        aiGenerated: input.aiGenerated,
        isTemplate: input.isTemplate,
      })
      .returning();
    await replaceMedia(row!.id, input.mediaIds, tx);
    await upsertVariants(ctx.workspaceId, row!.id, input.variants, tx);
    return row!;
  });
}

const EDIT_LOCKED = ["processing"] as const;

export async function updateContent(ctx: { workspaceId: string; userId: string }, id: string, patch: z.infer<typeof contentPatch>, conn: DbOrTx = db) {
  return conn.transaction(async (tx) => {
    const [existing] = await tx.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, ctx.workspaceId))).for("update");
    if (!existing) throw notFound("Post");
    const busy = await tx
      .select({ id: publishingJobs.id, platform: publishingJobs.platform, status: publishingJobs.status })
      .from(publishingJobs)
      .where(and(eq(publishingJobs.contentId, id), inArray(publishingJobs.status, [...EDIT_LOCKED, "published"])));
    if (busy.some((b) => b.status === "processing")) throw conflict("This post is being published right now. Try again in a moment.");
    const publishedPlatforms = new Set(busy.filter((b) => b.status === "published").map((b) => b.platform));
    if (patch.variants?.some((v) => publishedPlatforms.has(v.platform))) {
      throw conflict("Variants that were already published can't be edited. Duplicate the post to create a new version.");
    }
    if (patch.mediaIds) await assertMediaOwned(ctx.workspaceId, patch.mediaIds, tx);
    const { variants, mediaIds, ...fields } = patch;
    if (Object.keys(fields).length) {
      await tx.update(contentItems).set({ ...fields, title: fields.title || existing.title }).where(eq(contentItems.id, id));
    }
    if (mediaIds) await replaceMedia(id, mediaIds, tx);
    if (variants) await upsertVariants(ctx.workspaceId, id, variants, tx);
    return (await tx.select().from(contentItems).where(eq(contentItems.id, id)))[0]!;
  });
}

export async function getContent(workspaceId: string, id: string, conn: DbOrTx = db) {
  const [item] = await conn.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, workspaceId)));
  if (!item) throw notFound("Post");
  const [variants, media, jobs] = await Promise.all([
    conn.select().from(contentVariants).where(eq(contentVariants.contentId, id)),
    conn
      .select({ media: mediaAssets, position: contentMedia.position })
      .from(contentMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, contentMedia.mediaId))
      .where(eq(contentMedia.contentId, id))
      .orderBy(asc(contentMedia.position)),
    conn
      .select({
        job: publishingJobs,
        account: { id: socialAccounts.id, displayName: socialAccounts.displayName, username: socialAccounts.username, platform: socialAccounts.platform, status: socialAccounts.status },
      })
      .from(publishingJobs)
      .innerJoin(socialAccounts, eq(socialAccounts.id, publishingJobs.socialAccountId))
      .where(eq(publishingJobs.contentId, id))
      .orderBy(desc(publishingJobs.createdAt)),
  ]);
  return {
    ...item,
    variants,
    media: media.filter((m) => !m.media.deletedAt).map((m) => serializeMedia(m.media)),
    jobs: jobs.map((j) => ({ ...j.job, payloadSnapshot: undefined, account: j.account })),
  };
}

export const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "scheduled", "publishing", "published", "partially_published", "failed", "cancelled", "archived"]).optional(),
  view: z.enum(["all", "drafts", "published", "templates", "ai", "archived"]).default("all"),
  campaign: z.string().max(100).optional(),
  tag: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listContent(workspaceId: string, q: z.infer<typeof listQuery>) {
  const conds: (SQL | undefined)[] = [eq(contentItems.workspaceId, workspaceId)];
  if (q.view === "archived") conds.push(isNotNull(contentItems.archivedAt));
  else conds.push(isNull(contentItems.archivedAt));
  if (q.view === "drafts") conds.push(eq(contentItems.status, "draft"), eq(contentItems.isTemplate, false));
  if (q.view === "published") conds.push(inArray(contentItems.status, ["published", "partially_published"]));
  if (q.view === "templates") conds.push(eq(contentItems.isTemplate, true));
  if (q.view === "ai") conds.push(eq(contentItems.aiGenerated, true));
  if (q.status) conds.push(eq(contentItems.status, q.status));
  if (q.campaign) conds.push(eq(contentItems.campaign, q.campaign));
  if (q.tag) conds.push(sql`${q.tag} = any(${contentItems.tags})`);
  if (q.q) {
    const pattern = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(contentItems.title, pattern), ilike(contentItems.body, pattern), ilike(contentItems.campaign, pattern)));
  }
  const where = and(...conds);
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(contentItems)
      .where(where)
      .orderBy(desc(contentItems.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(contentItems).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  const variants = ids.length
    ? await db.select({ contentId: contentVariants.contentId, platform: contentVariants.platform }).from(contentVariants).where(inArray(contentVariants.contentId, ids))
    : [];
  return {
    items: rows.map((r) => ({ ...r, platforms: variants.filter((v) => v.contentId === r.id).map((v) => v.platform) })),
    page: q.page,
    pageSize: q.pageSize,
    total: total?.n ?? 0,
  };
}

export async function duplicateContent(ctx: { workspaceId: string; userId: string }, id: string) {
  const src = await getContent(ctx.workspaceId, id);
  const created = await createContent(ctx, {
    title: `${src.title} (copy)`.slice(0, 200),
    body: src.body,
    linkUrl: src.linkUrl,
    hashtags: src.hashtags,
    callToAction: src.callToAction,
    brandProfileId: src.brandProfileId,
    sourceDocumentId: src.sourceDocumentId,
    campaign: src.campaign,
    tags: src.tags,
    aiGenerated: src.aiGenerated,
    isTemplate: false,
    mediaIds: src.media.map((m) => m.id),
    variants: src.variants.map((v) => ({ platform: v.platform, body: v.body, hashtags: v.hashtags, includeMedia: v.includeMedia, aiGenerated: v.aiGenerated })),
  });
  return created;
}

/** Delete drafts outright; anything with publishing history is archived instead (history is kept). */
export async function deleteOrArchiveContent(ctx: { workspaceId: string; userId: string; req?: Request }, id: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, ctx.workspaceId))).for("update");
    if (!item) throw notFound("Post");
    const jobs = await tx.select({ status: publishingJobs.status }).from(publishingJobs).where(eq(publishingJobs.contentId, id));
    if (jobs.some((j) => j.status === "processing")) throw conflict("This post is publishing right now.");
    if (jobs.some((j) => j.status === "queued" || j.status === "scheduled")) {
      throw conflict("Cancel the scheduled destinations before deleting this post.");
    }
    if (jobs.length === 0) {
      await tx.delete(contentItems).where(eq(contentItems.id, id));
      await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "content.deleted", targetType: "content", targetId: id, req: ctx.req }, tx);
      return { deleted: true, archived: false };
    }
    await tx.update(contentItems).set({ archivedAt: new Date(), status: "archived" }).where(eq(contentItems.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "content.archived", targetType: "content", targetId: id, req: ctx.req }, tx);
    return { deleted: false, archived: true };
  });
}

export async function unarchiveContent(workspaceId: string, id: string) {
  await db.update(contentItems).set({ archivedAt: null, status: "draft" }).where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, workspaceId)));
  await refreshContentStatus(id);
}

type JobStatus = (typeof publishingJobs.$inferSelect)["status"];
type ContentStatus = (typeof contentItems.$inferSelect)["status"];

/** Roll destination outcomes up into a single content status (pure, unit-tested). */
export function rollupStatus(statuses: JobStatus[]): ContentStatus {
  const active: JobStatus[] = statuses.filter((s) => s !== "draft");
  if (!active.length) return "draft";
  const has = (s: JobStatus) => active.includes(s);
  if (has("processing")) return "publishing";
  if (has("queued") || has("scheduled")) return active.some((s) => s === "published") ? "publishing" : "scheduled";
  const published = active.filter((s) => s === "published").length;
  if (published === active.length) return "published";
  if (published > 0) return "partially_published";
  if (active.every((s) => s === "cancelled")) return "cancelled";
  return "failed";
}

export async function refreshContentStatus(contentId: string, conn: DbOrTx = db) {
  const [item] = await conn.select({ archivedAt: contentItems.archivedAt }).from(contentItems).where(eq(contentItems.id, contentId));
  if (!item || item.archivedAt) return;
  const jobs = await conn
    .select({ status: publishingJobs.status, scheduledAt: publishingJobs.scheduledAt })
    .from(publishingJobs)
    .where(eq(publishingJobs.contentId, contentId));
  const status = rollupStatus(jobs.map((j) => j.status));
  const pending = jobs.filter((j) => j.status === "scheduled" || j.status === "queued").map((j) => j.scheduledAt.getTime());
  await conn
    .update(contentItems)
    .set({ status, scheduledAt: pending.length ? new Date(Math.min(...pending)) : null })
    .where(eq(contentItems.id, contentId));
  return status;
}

export const platformsOf = (variants: { platform: Platform }[]) => variants.map((v) => v.platform);
