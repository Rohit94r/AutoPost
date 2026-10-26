import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import sharp from "sharp";
import { audit } from "@/server/audit";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { contentMedia, mediaAssets, publishingJobs } from "@/server/db/schema";
import { badRequest, conflict, notFound } from "@/server/errors";
import type { PreparedMedia } from "@/server/platforms/types";
import { storage, storageKey } from "@/server/storage";
import { assertQuota } from "@/server/usage/service";
import type { Platform } from "@/lib/platforms";
import { fitAsJpeg, fitForBluesky, fitForInstagram, fitForLinkedIn, fitForX } from "./transform";

/** Which normalisation each platform needs (null = upload the original). */
async function fitImageFor(platform: Platform, src: Buffer, mime: string): Promise<{ data: Buffer; mime: string } | null> {
  switch (platform) {
    case "instagram":
      return { data: await fitForInstagram(src), mime: "image/jpeg" };
    case "linkedin":
      return fitForLinkedIn(src, mime);
    case "x":
      return fitForX(src, mime);
    case "bluesky":
      return fitForBluesky(src, mime);
    case "threads":
    case "facebook":
    case "pinterest":
    case "telegram":
    case "wordpress":
      return fitAsJpeg(src, mime);
    default:
      return null;
  }
}
import { detectAndValidate, IMAGE_TYPES, mediaMaxBytes, safeFilename, VIDEO_TYPES } from "./validate";

export type MediaRow = typeof mediaAssets.$inferSelect;

export async function uploadMedia(input: { workspaceId: string; userId: string; file: File; altText?: string; req?: Request; correlationId?: string }) {
  const data = Buffer.from(await input.file.arrayBuffer());
  const isVideoDeclared = input.file.type.startsWith("video/");
  const detected = await detectAndValidate(
    data,
    input.file,
    [...IMAGE_TYPES, ...VIDEO_TYPES],
    mediaMaxBytes(isVideoDeclared ? "video" : "image"),
  );
  if (detected.kind === "pdf") throw badRequest("Use the Documents page for PDFs.");
  if (detected.kind === "image" && data.length > mediaMaxBytes("image")) throw badRequest("Image is too large.");
  await assertQuota(input.workspaceId, "storage", data.length);

  let width: number | null = null;
  let height: number | null = null;
  let thumbnailKey: string | null = null;
  const key = storageKey(input.workspaceId, "media", detected.ext);
  if (detected.kind === "image") {
    try {
      const meta = await sharp(data, { animated: false }).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      const thumb = await sharp(data).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      thumbnailKey = storageKey(input.workspaceId, "thumbs", "webp");
      await storage().put(thumbnailKey, thumb, "image/webp");
    } catch {
      throw badRequest("The image could not be read. It may be corrupted.");
    }
  }
  await storage().put(key, data, detected.mime);
  const [row] = await db
    .insert(mediaAssets)
    .values({
      workspaceId: input.workspaceId,
      uploadedBy: input.userId,
      kind: detected.kind,
      mimeType: detected.mime,
      sizeBytes: data.length,
      width,
      height,
      storageKey: key,
      thumbnailKey,
      originalFilename: safeFilename(input.file.name),
      sha256: sha256(data),
      altText: input.altText?.slice(0, 1000) || null,
    })
    .returning();
  await audit({ workspaceId: input.workspaceId, actorUserId: input.userId, action: "media.uploaded", targetType: "media", targetId: row!.id, metadata: { mime: detected.mime, size: data.length }, req: input.req, correlationId: input.correlationId });
  return serializeMedia(row!);
}

export function serializeMedia(m: MediaRow) {
  return {
    id: m.id,
    kind: m.kind,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    originalFilename: m.originalFilename,
    altText: m.altText,
    createdAt: m.createdAt,
    url: `/api/v1/media/${m.id}/file`,
    thumbnailUrl: m.thumbnailKey ? `/api/v1/media/${m.id}/file?variant=thumb` : null,
  };
}

export async function listMedia(workspaceId: string, opts: { kind?: "image" | "video"; limit?: number } = {}) {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt), opts.kind ? eq(mediaAssets.kind, opts.kind) : undefined))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(opts.limit ?? 60, 200));
  return rows.map(serializeMedia);
}

export async function getMedia(workspaceId: string, id: string) {
  const [m] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt)));
  if (!m) throw notFound("Media");
  return m;
}

/** Media used by a queued/scheduled/processing job cannot be deleted. */
export async function deleteMedia(input: { workspaceId: string; userId: string; id: string; req?: Request }) {
  const m = await getMedia(input.workspaceId, input.id);
  const inUse = await db
    .select({ id: publishingJobs.id })
    .from(publishingJobs)
    .innerJoin(contentMedia, eq(contentMedia.contentId, publishingJobs.contentId))
    .where(and(eq(contentMedia.mediaId, m.id), inArray(publishingJobs.status, ["queued", "scheduled", "processing"])))
    .limit(1);
  if (inUse.length) throw conflict("This media is attached to a post waiting to publish. Cancel or edit that post first.");
  await db.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, m.id));
  await storage().delete(m.storageKey).catch(() => undefined);
  if (m.thumbnailKey) await storage().delete(m.thumbnailKey).catch(() => undefined);
  await audit({ workspaceId: input.workspaceId, actorUserId: input.userId, action: "media.deleted", targetType: "media", targetId: m.id, req: input.req });
}

/**
 * Build platform-ready media. Images are normalised per platform (see ./transform):
 * Instagram → JPEG within size/aspect rules; LinkedIn → WebP/huge images to JPEG; X → ≤ 5 MB.
 * Derivatives are stored privately and exposed to platforms only via short-lived signed URLs.
 */
export function prepareMedia(m: MediaRow, platform: Platform): PreparedMedia {
  let derived: { key: string; mime: string; size: number } | null | undefined;
  const resolve = async () => {
    if (derived !== undefined) return derived;
    derived = null;
    if (m.kind !== "image") return derived;
    const src = await storage().get(m.storageKey);
    const out = await fitImageFor(platform, src, m.mimeType);
    if (out) {
      const key = `derived/${m.workspaceId}/${m.id}-${platform}.jpg`;
      await storage().put(key, out.data, out.mime);
      derived = { key, mime: out.mime, size: out.data.length };
    }
    return derived;
  };
  const willConvert = m.kind === "image" && (platform === "instagram" || (m.mimeType === "image/webp" && platform !== "x" && platform !== "mastodon" && platform !== "webhook"));
  return {
    id: m.id,
    kind: m.kind,
    mimeType: willConvert ? "image/jpeg" : m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    altText: m.altText,
    load: async () => {
      const d = await resolve();
      return storage().get(d ? d.key : m.storageKey);
    },
    publicUrl: async (ttl) => {
      const d = await resolve();
      return storage().publicUrl(d ? d.key : m.storageKey, ttl);
    },
  };
}

/** Store an AI-generated image in the media library (re-encoded, thumbnailed, quota-checked). */
export async function saveGeneratedMedia(input: { workspaceId: string; userId: string; data: Buffer; mimeType: string; altText?: string }) {
  const png = await sharp(input.data).png().toBuffer();
  await assertQuota(input.workspaceId, "storage", png.length);
  const meta = await sharp(png).metadata();
  const key = storageKey(input.workspaceId, "media", "png");
  const thumbnailKey = storageKey(input.workspaceId, "thumbs", "webp");
  await storage().put(key, png, "image/png");
  await storage().put(thumbnailKey, await sharp(png).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(), "image/webp");
  const [row] = await db
    .insert(mediaAssets)
    .values({
      workspaceId: input.workspaceId,
      uploadedBy: input.userId,
      kind: "image",
      mimeType: "image/png",
      sizeBytes: png.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      storageKey: key,
      thumbnailKey,
      originalFilename: `ai-image-${new Date().toISOString().slice(0, 10)}.png`,
      sha256: sha256(png),
      altText: input.altText?.slice(0, 1000) ?? null,
    })
    .returning();
  await audit({ workspaceId: input.workspaceId, actorUserId: input.userId, action: "media.generated", targetType: "media", targetId: row!.id });
  return serializeMedia(row!);
}
