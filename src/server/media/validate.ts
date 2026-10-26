import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { env } from "@/server/env";
import { badRequest } from "@/server/errors";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

const EXT_FOR: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "video/mp4": ["mp4", "m4v"],
  "video/quicktime": ["mov"],
  "application/pdf": ["pdf"],
};

export interface DetectedFile {
  mime: string;
  ext: string;
  kind: "image" | "video" | "pdf";
}

/**
 * Validates an upload by content signature (magic bytes), not by the client-declared type.
 * The extension and declared MIME must agree with the detected type; anything else is rejected.
 */
export async function detectAndValidate(
  data: Buffer,
  file: { name: string; type: string },
  allowed: readonly string[],
  maxBytes: number,
): Promise<DetectedFile> {
  if (data.length === 0) throw badRequest("The file is empty.");
  if (data.length > maxBytes) throw badRequest(`The file is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const detected = await fileTypeFromBuffer(data);
  if (!detected || !allowed.includes(detected.mime)) {
    throw badRequest(`Unsupported or unrecognised file type. Allowed: ${allowed.map((a) => a.split("/")[1]).join(", ")}.`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EXT_FOR[detected.mime]?.includes(ext)) {
    throw badRequest(`The file extension ".${ext}" doesn't match its contents (${detected.mime}).`);
  }
  if (file.type && file.type !== "application/octet-stream" && file.type !== detected.mime && !(file.type === "image/jpg" && detected.mime === "image/jpeg")) {
    throw badRequest("The declared file type doesn't match the file contents.");
  }
  const kind = detected.mime === "application/pdf" ? "pdf" : detected.mime.startsWith("video/") ? "video" : "image";
  return { mime: detected.mime, ext: detected.ext, kind };
}

export function mediaMaxBytes(kind: "image" | "video") {
  const e = env();
  return (kind === "video" ? e.MEDIA_MAX_VIDEO_MB : e.MEDIA_MAX_IMAGE_MB) * 1024 * 1024;
}

export const safeFilename = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "file";
