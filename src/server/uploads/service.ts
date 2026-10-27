import "server-only";
import { z } from "zod";
import { requestExtraction, uploadDocument } from "@/server/documents/service";
import { env } from "@/server/env";
import { badRequest } from "@/server/errors";
import { uploadMedia } from "@/server/media/service";
import { DOCUMENT_TYPES, IMAGE_TYPES, mediaMaxBytes, VIDEO_TYPES } from "@/server/media/validate";
import { storage, storageKey } from "@/server/storage";
import { assertQuota } from "@/server/usage/service";

/**
 * Direct-to-storage uploads. The browser PUTs the file to a short-lived signed URL, then calls
 * `completeUpload`, which runs the same validation as a normal upload (magic bytes, size, quota)
 * and stores the file under its final key. Needed on Vercel, where request bodies are capped at 4.5 MB.
 * With database storage there's no bucket to upload to, so the browser sends the file to the app in
 * parts smaller than that limit ("chunked"); with local disk it posts a normal form ("form").
 */
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024 + 512 * 1024;
const UPLOAD_KEY = /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,5})?$/;
export const startUploadInput = z.object({
  purpose: z.enum(["media", "document"]),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

export const completeUploadInput = z.object({
  purpose: z.enum(["media", "document"]),
  key: z.string().regex(UPLOAD_KEY, "Unknown upload"),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  altText: z.string().max(1000).optional(),
  consent: z.boolean().optional(),
});

function limitFor(purpose: "media" | "document", contentType: string) {
  if (purpose === "document") return env().DOCUMENT_MAX_MB * 1024 * 1024;
  return mediaMaxBytes(contentType.startsWith("video/") ? "video" : "image");
}

export async function startUpload(workspaceId: string, input: z.infer<typeof startUploadInput>) {
  const allowed: readonly string[] = input.purpose === "document" ? DOCUMENT_TYPES : [...IMAGE_TYPES, ...VIDEO_TYPES];
  if (!allowed.includes(input.contentType)) throw badRequest(`Unsupported file type. Allowed: ${allowed.map((t) => t.split("/")[1]).join(", ")}.`);
  const max = limitFor(input.purpose, input.contentType);
  if (input.size > max) throw badRequest(`This file is too large (max ${Math.round(max / 1024 / 1024)} MB).`);
  if (input.purpose === "document") await assertQuota(workspaceId, "document");
  await assertQuota(workspaceId, "storage", input.size);
  const ext = /\.([a-z0-9]{1,5})$/i.exec(input.filename)?.[1]?.toLowerCase() ?? "";
  const key = storageKey(workspaceId, "uploads", ext);
  const uploadUrl = await storage().directUploadUrl(key, input.contentType, 15 * 60);
  if (uploadUrl) return { mode: "direct" as const, key, uploadUrl };
  if (storage().appendChunk) return { mode: "chunked" as const, key, chunkSize: UPLOAD_CHUNK_BYTES };
  return { mode: "form" as const };
}

/** One part of a chunked upload (database storage). */
export async function uploadChunk(workspaceId: string, key: string, index: number, data: Buffer) {
  if (!UPLOAD_KEY.test(key) || !key.startsWith(`uploads/${workspaceId}/`)) throw badRequest("Unknown upload");
  const maxParts = Math.ceil(Math.max(env().DOCUMENT_MAX_MB, env().MEDIA_MAX_VIDEO_MB, env().MEDIA_MAX_IMAGE_MB) * 1024 * 1024 / UPLOAD_CHUNK_BYTES);
  if (!Number.isInteger(index) || index < 0 || index >= maxParts) throw badRequest("Invalid upload part.");
  if (data.length === 0 || data.length > UPLOAD_CHUNK_BYTES) throw badRequest("Invalid upload part size.");
  const store = storage();
  if (!store.appendChunk) throw badRequest("This server doesn't take uploads in parts.");
  await store.appendChunk(key, index, data);
}

export async function completeUpload(ctx: { workspaceId: string; userId: string; correlationId: string; req?: Request }, input: z.infer<typeof completeUploadInput>) {
  if (!input.key.startsWith(`uploads/${ctx.workspaceId}/`)) throw badRequest("Unknown upload");
  const size = await storage().size(input.key);
  if (size === null) throw badRequest("The upload didn't finish. Please try again.");
  try {
    if (size > limitFor(input.purpose, input.contentType)) throw badRequest("This file is too large.");
    const data = await storage().get(input.key);
    const file = new File([new Uint8Array(data)], input.filename, { type: input.contentType });
    if (input.purpose === "media") {
      return { media: await uploadMedia({ workspaceId: ctx.workspaceId, userId: ctx.userId, file, altText: input.altText, req: ctx.req, correlationId: ctx.correlationId }) };
    }
    const doc = await uploadDocument({ workspaceId: ctx.workspaceId, userId: ctx.userId, file, consent: input.consent === true, req: ctx.req, correlationId: ctx.correlationId });
    const { queued } = await requestExtraction({ workspaceId: ctx.workspaceId, userId: ctx.userId, documentId: doc.id, correlationId: ctx.correlationId });
    return { document: { id: doc.id, status: queued ? "processing" : undefined } };
  } finally {
    // The validated copy lives under its final key; the temporary upload is always removed.
    await storage().delete(input.key).catch(() => undefined);
  }
}
