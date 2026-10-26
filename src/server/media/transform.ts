import "server-only";
import sharp, { type Sharp } from "sharp";

/**
 * Platform media normalisation. Everything here preserves the whole image (letterboxing, never
 * cropping) so text on certificates/posters is never cut off.
 */

export const INSTAGRAM = { minRatio: 4 / 5, maxRatio: 1.91, maxWidth: 1440, minWidth: 320, maxBytes: 8 * 1024 * 1024 };
export const LINKEDIN_MAX_PIXELS = 36_152_320;
export const X_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function jpegUnder(img: Sharp, maxBytes: number): Promise<Buffer> {
  for (const quality of [90, 82, 74, 66, 58]) {
    const out = await img.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) return out;
  }
  return img.clone().resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
}

/** Instagram feed image: JPEG, 320–1440px wide, aspect 4:5 … 1.91:1, ≤ 8 MB. */
export async function fitForInstagram(input: Buffer, background = "#ffffff"): Promise<Buffer> {
  const rotated = await sharp(input).rotate().flatten({ background }).toBuffer();
  const meta = await sharp(rotated).metadata();
  let width = meta.width ?? INSTAGRAM.maxWidth;
  let height = meta.height ?? INSTAGRAM.maxWidth;
  let img = sharp(rotated);

  if (width > INSTAGRAM.maxWidth || width < INSTAGRAM.minWidth) {
    const target = Math.min(Math.max(width, INSTAGRAM.minWidth), INSTAGRAM.maxWidth);
    height = Math.round((height * target) / width);
    width = target;
    img = sharp(await img.resize({ width }).toBuffer());
  }

  const ratio = width / height;
  if (ratio < INSTAGRAM.minRatio) {
    // Too tall: pad left/right.
    const targetWidth = Math.ceil(height * INSTAGRAM.minRatio);
    const pad = targetWidth - width;
    img = sharp(await img.extend({ left: Math.floor(pad / 2), right: Math.ceil(pad / 2), background }).toBuffer());
    if (targetWidth > INSTAGRAM.maxWidth) img = sharp(await img.resize({ width: INSTAGRAM.maxWidth }).toBuffer());
  } else if (ratio > INSTAGRAM.maxRatio) {
    // Too wide: pad top/bottom.
    const targetHeight = Math.ceil(width / INSTAGRAM.maxRatio);
    const pad = targetHeight - height;
    img = sharp(await img.extend({ top: Math.floor(pad / 2), bottom: Math.ceil(pad / 2), background }).toBuffer());
  }
  return jpegUnder(img, INSTAGRAM.maxBytes);
}

/** LinkedIn accepts JPG/PNG/GIF under ~36 MP: convert WebP and downscale huge images. */
export async function fitForLinkedIn(input: Buffer, mime: string): Promise<{ data: Buffer; mime: string } | null> {
  const meta = await sharp(input).metadata();
  const pixels = (meta.width ?? 0) * (meta.height ?? 0);
  if (mime !== "image/webp" && pixels <= LINKEDIN_MAX_PIXELS) return null;
  let img = sharp(input).rotate().flatten({ background: "#ffffff" });
  if (pixels > LINKEDIN_MAX_PIXELS) {
    const scale = Math.sqrt(LINKEDIN_MAX_PIXELS / pixels) * 0.98;
    img = img.resize({ width: Math.floor((meta.width ?? 0) * scale) });
  }
  return { data: await img.jpeg({ quality: 90 }).toBuffer(), mime: "image/jpeg" };
}

/** X images must be ≤ 5 MB (GIFs are left untouched). */
export async function fitForX(input: Buffer, mime: string): Promise<{ data: Buffer; mime: string } | null> {
  if (mime === "image/gif" || input.length <= X_MAX_IMAGE_BYTES) return null;
  return { data: await jpegUnder(sharp(input).rotate().flatten({ background: "#ffffff" }).resize({ width: 4096, withoutEnlargement: true }), X_MAX_IMAGE_BYTES), mime: "image/jpeg" };
}

/** Bluesky blobs must be under 1,000,000 bytes: downscale to ≤ 2000px and recompress as JPEG. */
export async function fitForBluesky(input: Buffer, mime: string): Promise<{ data: Buffer; mime: string } | null> {
  if (input.length < 950_000 && mime !== "image/webp") return null;
  const img = sharp(input).rotate().flatten({ background: "#ffffff" }).resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true });
  return { data: await jpegUnder(img, 950_000), mime: "image/jpeg" };
}

/** Generic JPEG normalisation for platforms that fetch images by URL (Threads, Facebook, Pinterest). */
export async function fitAsJpeg(input: Buffer, mime: string, maxBytes = 8 * 1024 * 1024): Promise<{ data: Buffer; mime: string } | null> {
  if ((mime === "image/jpeg" || mime === "image/png") && input.length <= maxBytes) return null;
  const img = sharp(input).rotate().flatten({ background: "#ffffff" }).resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true });
  return { data: await jpegUnder(img, maxBytes), mime: "image/jpeg" };
}
