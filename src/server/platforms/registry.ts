import "server-only";
import type { Platform } from "@/lib/platforms";
import { BlueskyAdapter } from "./bluesky";
import { DiscordAdapter } from "./discord";
import { FacebookAdapter } from "./facebook";
import { InstagramAdapter } from "./instagram";
import { LinkedInAdapter } from "./linkedin";
import { MastodonAdapter } from "./mastodon";
import { PinterestAdapter } from "./pinterest";
import { RedditAdapter } from "./reddit";
import { TelegramAdapter } from "./telegram";
import { ThreadsAdapter } from "./threads";
import { TikTokAdapter } from "./tiktok";
import type { PlatformAdapter } from "./types";
import { WebhookAdapter } from "./webhook";
import { WordPressAdapter } from "./wordpress";
import { XAdapter } from "./x";
import { YouTubeAdapter } from "./youtube";

const create = (): Record<Platform, PlatformAdapter> => ({
  linkedin: new LinkedInAdapter(),
  instagram: new InstagramAdapter(),
  x: new XAdapter(),
  facebook: new FacebookAdapter(),
  threads: new ThreadsAdapter(),
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
  pinterest: new PinterestAdapter(),
  reddit: new RedditAdapter(),
  bluesky: new BlueskyAdapter(),
  mastodon: new MastodonAdapter(),
  telegram: new TelegramAdapter(),
  discord: new DiscordAdapter(),
  wordpress: new WordPressAdapter(),
  webhook: new WebhookAdapter(),
});

let adapters: Record<Platform, PlatformAdapter> | undefined;

export function getAdapter(platform: Platform): PlatformAdapter {
  adapters ??= create();
  return adapters[platform];
}

export function setAdaptersForTesting(a: Partial<Record<Platform, PlatformAdapter>> | undefined) {
  adapters = a ? { ...create(), ...a } : undefined;
}
