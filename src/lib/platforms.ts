/**
 * Client-safe platform metadata and text-limit validation.
 * Limits reflect the platforms' documented constraints; keep them here (one place) so UI
 * warnings and server-side validation never disagree.
 */
export const PLATFORMS = ["linkedin", "instagram", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformLimits {
  maxChars: number;
  maxHashtags: number | null;
  maxMentions: number | null;
  requiresMedia: boolean;
  maxImages: number;
  maxVideos: number;
  imageMimeTypes: string[];
  videoMimeTypes: string[];
  weightedCount: boolean;
}

export const PLATFORM_META: Record<Platform, { label: string; color: string; short: string; docs: string }> = {
  linkedin: {
    label: "LinkedIn",
    short: "in",
    color: "#0A66C2",
    docs: "https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api",
  },
  instagram: {
    label: "Instagram",
    short: "ig",
    color: "#E1306C",
    docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },
  x: { label: "X", short: "x", color: "#e7e9ea", docs: "https://docs.x.com/x-api/posts/create-post" },
};

export function platformLimits(platform: Platform, opts: { xMaxLength?: number } = {}): PlatformLimits {
  switch (platform) {
    case "linkedin":
      return {
        maxChars: 3000,
        maxHashtags: null,
        maxMentions: null,
        requiresMedia: false,
        maxImages: 1,
        maxVideos: 1,
        // WebP is converted to JPEG automatically before upload.
        imageMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        videoMimeTypes: ["video/mp4"],
        weightedCount: false,
      };
    case "instagram":
      return {
        maxChars: 2200,
        maxHashtags: 30,
        maxMentions: 20,
        requiresMedia: true,
        maxImages: 1,
        maxVideos: 1,
        // Instagram publishing accepts JPEG only; PNG/WebP are converted to JPEG automatically.
        imageMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        videoMimeTypes: ["video/mp4", "video/quicktime"],
        weightedCount: false,
      };
    case "x":
      return {
        maxChars: opts.xMaxLength ?? 280,
        maxHashtags: null,
        maxMentions: null,
        requiresMedia: false,
        maxImages: 4,
        maxVideos: 1,
        imageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        videoMimeTypes: ["video/mp4"],
        weightedCount: true,
      };
  }
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /(^|\s)@[\w.]+/g;

/**
 * X counts text with weights: URLs are always 23 chars (t.co), code points in the
 * "light" ranges count 1, everything else (CJK, most emoji) counts 2. Text is NFC-normalized.
 * Mirrors twitter-text v3 config: ranges 0–4351, 8192–8205, 8208–8223, 8242–8247.
 */
export function xWeightedLength(text: string): number {
  const normalized = text.normalize("NFC");
  let length = 0;
  let rest = normalized;
  const urls = normalized.match(URL_RE) ?? [];
  for (const url of urls) {
    length += 23;
    rest = rest.replace(url, "");
  }
  for (const ch of rest) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      (cp >= 0 && cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    length += light ? 1 : 2;
  }
  return length;
}

export function countHashtags(text: string): number {
  return (text.match(HASHTAG_RE) ?? []).length;
}

export function countMentions(text: string): number {
  return (text.match(MENTION_RE) ?? []).length;
}

export function composeFinalText(body: string, hashtags: string[] = []): string {
  const tags = hashtags
    .map((h) => h.trim().replace(/^#*/, ""))
    .filter(Boolean)
    .filter((h) => !new RegExp(`(^|\\s)#${escapeRegExp(h)}(\\b|$)`, "iu").test(body))
    .map((h) => `#${h}`);
  return tags.length ? `${body.trimEnd()}\n\n${tags.join(" ")}` : body;
}

/**
 * Exactly the text that will be sent to a platform: body + hashtags + link.
 * Links are appended for LinkedIn and X (Instagram captions can't hold clickable links).
 * Used by the composer, pre-publish validation and the executor so they never disagree.
 */
export function finalPostText(platform: Platform, body: string, hashtags: string[] = [], linkUrl?: string | null): string {
  const text = composeFinalText(body, hashtags);
  if (linkUrl && platform !== "instagram" && !text.includes(linkUrl)) return `${text}\n\n${linkUrl}`;
  return text;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateMedia(platform: Platform, media: { kind: "image" | "video"; mimeType: string }[]): ValidationIssue[] {
  const limits = platformLimits(platform);
  const label = PLATFORM_META[platform].label;
  const issues: ValidationIssue[] = [];
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  if (images.length > limits.maxImages) issues.push({ level: "error", code: "too_many_images", message: `${label} supports up to ${limits.maxImages} image(s) per post here.` });
  if (videos.length > limits.maxVideos) issues.push({ level: "error", code: "too_many_videos", message: `${label} supports ${limits.maxVideos} video per post.` });
  if (images.length && videos.length) issues.push({ level: "error", code: "mixed_media", message: `${label} posts can't mix images and video here.` });
  for (const m of media) {
    const allowed = m.kind === "image" ? limits.imageMimeTypes : limits.videoMimeTypes;
    if (!allowed.includes(m.mimeType)) issues.push({ level: "error", code: "media_format", message: `${label} doesn't accept ${m.mimeType}.` });
  }
  return issues;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export function textLength(platform: Platform, text: string): number {
  return platform === "x" ? xWeightedLength(text) : [...text].length;
}

export function validateText(
  platform: Platform,
  text: string,
  opts: { mediaCount?: number; xMaxLength?: number } = {},
): ValidationIssue[] {
  const limits = platformLimits(platform, opts);
  const issues: ValidationIssue[] = [];
  const len = textLength(platform, text);
  const label = PLATFORM_META[platform].label;
  if (text.trim().length === 0 && !(opts.mediaCount && platform !== "linkedin")) {
    issues.push({ level: "error", code: "empty", message: `${label} post text is empty.` });
  }
  if (len > limits.maxChars) {
    issues.push({
      level: "error",
      code: "too_long",
      message: `${label} allows ${limits.maxChars} characters${limits.weightedCount ? " (weighted)" : ""}; this has ${len}.`,
    });
  } else if (len > limits.maxChars * 0.9) {
    issues.push({ level: "warning", code: "near_limit", message: `${label} text is close to the ${limits.maxChars} limit.` });
  }
  const tags = countHashtags(text);
  if (limits.maxHashtags !== null && tags > limits.maxHashtags) {
    issues.push({ level: "error", code: "too_many_hashtags", message: `${label} allows at most ${limits.maxHashtags} hashtags.` });
  } else if (tags > 5 && platform !== "instagram") {
    issues.push({ level: "warning", code: "many_hashtags", message: `${tags} hashtags may look spammy on ${label}.` });
  }
  if (limits.maxMentions !== null && countMentions(text) > limits.maxMentions) {
    issues.push({ level: "error", code: "too_many_mentions", message: `${label} allows at most ${limits.maxMentions} @mentions.` });
  }
  if (limits.requiresMedia && !opts.mediaCount) {
    issues.push({ level: "error", code: "media_required", message: `${label} posts require an image or video.` });
  }
  return issues;
}
