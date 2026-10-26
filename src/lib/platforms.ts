/**
 * Client-safe platform metadata and text-limit validation.
 * Limits reflect the platforms' documented constraints; keep them here (one place) so UI
 * warnings and server-side validation never disagree.
 */
export const PLATFORMS = [
  "linkedin",
  "instagram",
  "x",
  "facebook",
  "threads",
  "youtube",
  "tiktok",
  "pinterest",
  "reddit",
  "bluesky",
  "mastodon",
  "telegram",
  "discord",
  "wordpress",
  "webhook",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformLimits {
  maxChars: number;
  maxHashtags: number | null;
  maxMentions: number | null;
  requiresMedia: boolean;
  /** Media kinds the platform requires (e.g. YouTube/TikTok need a video). */
  requiresKind?: "video" | "image" | null;
  maxImages: number;
  maxVideos: number;
  imageMimeTypes: string[];
  videoMimeTypes: string[];
  weightedCount: boolean;
  /** Count user-perceived characters (graphemes) instead of code points. */
  graphemeCount?: boolean;
}

export type ConnectionType = "oauth" | "credentials";
export type PlatformGroup = "social" | "video" | "community" | "messaging" | "web";

export interface PlatformInfo {
  label: string;
  short: string;
  color: string;
  docs: string;
  group: PlatformGroup;
  connection: ConnectionType;
  /** What we can do through the official API (shown honestly in the UI). */
  can: { publish: boolean; comments: "read_reply" | "read" | "none"; mentions: boolean; metrics: boolean; importPosts: boolean };
  /** One-line note shown in the Accounts page. */
  note: string;
}

export const PLATFORM_META: Record<Platform, PlatformInfo> = {
  linkedin: {
    label: "LinkedIn",
    short: "in",
    color: "#0A66C2",
    docs: "https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: false, metrics: true, importPosts: false },
    note: "Personal profiles can publish. Comments, replies and analytics need Community Management API approval (organization pages).",
  },
  instagram: {
    label: "Instagram",
    short: "ig",
    color: "#E1306C",
    docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: false, metrics: true, importPosts: true },
    note: "Business or Creator accounts only. Media must be reachable from a public HTTPS URL.",
  },
  x: {
    label: "X",
    short: "x",
    color: "#e7e9ea",
    docs: "https://docs.x.com/x-api/posts/create-post",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: true, metrics: true, importPosts: true },
    note: "Pay-per-use API: posts with links and every read cost credits on your X developer account.",
  },
  facebook: {
    label: "Facebook Pages",
    short: "fb",
    color: "#1877F2",
    docs: "https://developers.facebook.com/docs/pages-api/posts",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: false, metrics: true, importPosts: true },
    note: "Publishes to Pages you manage (not personal timelines, which Meta doesn't allow).",
  },
  threads: {
    label: "Threads",
    short: "th",
    color: "#ffffff",
    docs: "https://developers.facebook.com/docs/threads",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: true, metrics: true, importPosts: true },
    note: "Text, image or video posts up to 500 characters.",
  },
  youtube: {
    label: "YouTube",
    short: "yt",
    color: "#FF0033",
    docs: "https://developers.google.com/youtube/v3/guides/uploading_a_video",
    group: "video",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: false, metrics: true, importPosts: true },
    note: "Video uploads only. Unverified Google projects can only upload private videos.",
  },
  tiktok: {
    label: "TikTok",
    short: "tt",
    color: "#25F4EE",
    docs: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    group: "video",
    connection: "oauth",
    can: { publish: true, comments: "none", mentions: false, metrics: true, importPosts: true },
    note: "Video posting via the Content Posting API. Until TikTok audits your app, posts are private (only you).",
  },
  pinterest: {
    label: "Pinterest",
    short: "pin",
    color: "#E60023",
    docs: "https://developers.pinterest.com/docs/api/v5/pins-create",
    group: "social",
    connection: "oauth",
    can: { publish: true, comments: "none", mentions: false, metrics: true, importPosts: false },
    note: "Creates Pins on a board you choose. Needs an image.",
  },
  reddit: {
    label: "Reddit",
    short: "rd",
    color: "#FF4500",
    docs: "https://www.reddit.com/dev/api/#POST_api_submit",
    group: "community",
    connection: "oauth",
    can: { publish: true, comments: "read_reply", mentions: true, metrics: true, importPosts: false },
    note: "Posts to your profile or a subreddit you choose. Follow each subreddit's rules.",
  },
  bluesky: {
    label: "Bluesky",
    short: "bs",
    color: "#1185FE",
    docs: "https://docs.bsky.app/docs/advanced-guides/posts",
    group: "social",
    connection: "credentials",
    can: { publish: true, comments: "read_reply", mentions: true, metrics: true, importPosts: true },
    note: "Connect with an App Password (Settings → Privacy and security → App passwords), never your main password.",
  },
  mastodon: {
    label: "Mastodon",
    short: "md",
    color: "#6364FF",
    docs: "https://docs.joinmastodon.org/methods/statuses/",
    group: "social",
    connection: "credentials",
    can: { publish: true, comments: "read_reply", mentions: true, metrics: true, importPosts: true },
    note: "Connect with your instance URL and an access token from Preferences → Development (scopes: read, write).",
  },
  telegram: {
    label: "Telegram",
    short: "tg",
    color: "#26A5E4",
    docs: "https://core.telegram.org/bots/api#sendmessage",
    group: "messaging",
    connection: "credentials",
    can: { publish: true, comments: "none", mentions: false, metrics: false, importPosts: false },
    note: "Posts to a channel through your bot. Add the bot as a channel admin first.",
  },
  discord: {
    label: "Discord",
    short: "dc",
    color: "#5865F2",
    docs: "https://discord.com/developers/docs/resources/webhook#execute-webhook",
    group: "messaging",
    connection: "credentials",
    can: { publish: true, comments: "none", mentions: false, metrics: false, importPosts: false },
    note: "Posts to a channel through a webhook (Channel settings → Integrations → Webhooks).",
  },
  wordpress: {
    label: "WordPress / blog",
    short: "wp",
    color: "#3858E9",
    docs: "https://developer.wordpress.org/rest-api/reference/posts/",
    group: "web",
    connection: "credentials",
    can: { publish: true, comments: "read_reply", mentions: false, metrics: false, importPosts: true },
    note: "Publishes to your own WordPress site with an Application Password (Users → Profile).",
  },
  webhook: {
    label: "Custom website",
    short: "web",
    color: "#a3e635",
    docs: "/help#webhooks",
    group: "web",
    connection: "credentials",
    can: { publish: true, comments: "none", mentions: false, metrics: false, importPosts: false },
    note: "Sends each post as signed JSON to your own website or automation endpoint.",
  },
};

const IMG_COMMON = ["image/jpeg", "image/png", "image/webp"];

const LIMITS: Record<Platform, PlatformLimits> = {
  // WebP is converted to JPEG automatically before upload.
  linkedin: { maxChars: 3000, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 1, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4"], weightedCount: false },
  // Instagram publishing accepts JPEG only; PNG/WebP are converted to JPEG automatically.
  instagram: { maxChars: 2200, maxHashtags: 30, maxMentions: 20, requiresMedia: true, maxImages: 1, maxVideos: 1, imageMimeTypes: IMG_COMMON, videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  x: { maxChars: 280, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 4, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4"], weightedCount: true },
  facebook: { maxChars: 63206, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 1, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  threads: { maxChars: 500, maxHashtags: 1, maxMentions: null, requiresMedia: false, maxImages: 1, maxVideos: 1, imageMimeTypes: IMG_COMMON, videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  youtube: { maxChars: 5000, maxHashtags: 15, maxMentions: null, requiresMedia: true, requiresKind: "video", maxImages: 0, maxVideos: 1, imageMimeTypes: [], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  tiktok: { maxChars: 2200, maxHashtags: null, maxMentions: null, requiresMedia: true, requiresKind: "video", maxImages: 0, maxVideos: 1, imageMimeTypes: [], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  pinterest: { maxChars: 500, maxHashtags: null, maxMentions: null, requiresMedia: true, requiresKind: "image", maxImages: 1, maxVideos: 0, imageMimeTypes: IMG_COMMON, videoMimeTypes: [], weightedCount: false },
  reddit: { maxChars: 40000, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 0, maxVideos: 0, imageMimeTypes: [], videoMimeTypes: [], weightedCount: false },
  bluesky: { maxChars: 300, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 4, maxVideos: 0, imageMimeTypes: IMG_COMMON, videoMimeTypes: [], weightedCount: false, graphemeCount: true },
  mastodon: { maxChars: 500, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 4, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  telegram: { maxChars: 4096, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 1, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4"], weightedCount: false },
  discord: { maxChars: 2000, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 4, maxVideos: 1, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
  wordpress: { maxChars: 100000, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 1, maxVideos: 0, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: [], weightedCount: false },
  webhook: { maxChars: 100000, maxHashtags: null, maxMentions: null, requiresMedia: false, maxImages: 10, maxVideos: 4, imageMimeTypes: [...IMG_COMMON, "image/gif"], videoMimeTypes: ["video/mp4", "video/quicktime"], weightedCount: false },
};

export function platformLimits(platform: Platform, opts: { xMaxLength?: number } = {}): PlatformLimits {
  const l = LIMITS[platform];
  return platform === "x" && opts.xMaxLength ? { ...l, maxChars: opts.xMaxLength } : l;
}

export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);

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

/** Platforms where caption links aren't clickable (or a separate link field is used instead). */
export const NO_INLINE_LINKS: ReadonlySet<Platform> = new Set<Platform>(["instagram", "tiktok", "pinterest"]);

/**
 * Exactly the text that will be sent to a platform: body + hashtags + link.
 * Links are appended for LinkedIn and X (Instagram captions can't hold clickable links).
 * Used by the composer, pre-publish validation and the executor so they never disagree.
 */
export function finalPostText(platform: Platform, body: string, hashtags: string[] = [], linkUrl?: string | null): string {
  const text = composeFinalText(body, hashtags);
  if (linkUrl && !NO_INLINE_LINKS.has(platform) && !text.includes(linkUrl)) return `${text}\n\n${linkUrl}`;
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
  if (limits.requiresKind && media.length && !media.some((m) => m.kind === limits.requiresKind)) {
    issues.push({ level: "error", code: "media_kind", message: `${label} needs ${limits.requiresKind === "video" ? "a video" : "an image"}.` });
  }
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

export function graphemeLength(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (!Seg) return [...text].length;
  let n = 0;
  for (const _ of new Seg(undefined, { granularity: "grapheme" }).segment(text)) n++;
  return n;
}

export function textLength(platform: Platform, text: string): number {
  if (platform === "x") return xWeightedLength(text);
  if (LIMITS[platform].graphemeCount) return graphemeLength(text);
  return [...text].length;
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
    const what = limits.requiresKind === "video" ? "a video" : limits.requiresKind === "image" ? "an image" : "an image or video";
    issues.push({ level: "error", code: "media_required", message: `${label} posts require ${what}.` });
  }
  return issues;
}
