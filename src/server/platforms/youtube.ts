import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, meta, toDate } from "./base";
import { bearer, errorFromStatus, expiresAtFrom, platformFetch, readJson } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type ReplyInput, type TokenSet } from "./types";

/**
 * YouTube Data API v3 with Google OAuth (offline access). Video uploads only.
 * Docs: developers.google.com/youtube/v3 — upload quota is a separate bucket (default 100/day).
 */
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

export class YouTubeAdapter extends BaseAdapter {
  readonly platform = "youtube" as const;

  private get cfg() {
    const e = env();
    return { id: e.YOUTUBE_CLIENT_ID ?? e.GOOGLE_CLIENT_ID, secret: e.YOUTUBE_CLIENT_SECRET ?? e.GOOGLE_CLIENT_SECRET };
  }
  override isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }
  override requestedScopes() {
    return ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl", "https://www.googleapis.com/auth/youtube.readonly"];
  }
  override requiredPublishScopes() {
    return ["https://www.googleapis.com/auth/youtube.upload"];
  }

  private async fail(res: Response): Promise<never> {
    const body = (await readJson(res)) as { error?: { message?: string; errors?: { reason?: string }[] } | string; error_description?: string };
    const err = typeof body.error === "object" ? body.error : undefined;
    const reason = err?.errors?.[0]?.reason ?? (typeof body.error === "string" ? body.error : "");
    const msg = err?.message ?? body.error_description ?? reason;
    if (reason === "invalid_grant" || res.status === 401) throw new PlatformError("auth", "YouTube access expired or was revoked. Reconnect the channel.");
    if (reason === "quotaExceeded" || reason === "uploadLimitExceeded" || reason === "rateLimitExceeded") throw new PlatformError("rate_limit", `YouTube quota reached (${reason}). Try again tomorrow.`, { retryAfterSec: 6 * 3600 });
    if (reason === "youtubeSignupRequired") throw new PlatformError("permission", "This Google account has no YouTube channel yet. Create one first.");
    throw errorFromStatus(res.status, msg ? `YouTube: ${msg}` : "", res);
  }

  private async get<T>(path: string, token: string): Promise<T> {
    const res = await platformFetch(`${API}${path}`, { headers: bearer(token) });
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(AUTH);
    for (const [k, v] of Object.entries({
      client_id: this.cfg.id!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: this.requestedScopes().join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }))
      u.searchParams.set(k, v);
    return u.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await platformFetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.cfg.id!, client_secret: this.cfg.secret!, ...params }),
    });
    if (!res.ok) await this.fail(res);
    const b = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!b.access_token) throw new PlatformError("auth", "Google did not return an access token.");
    return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: expiresAtFrom(b.expires_in), scopes: (b.scope ?? "").split(" ").filter(Boolean) };
  }

  override exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }) {
    return this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  }
  override canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }
  override async refresh({ refreshToken }: { refreshToken?: string | null }) {
    if (!refreshToken) throw new PlatformError("auth", "No YouTube refresh token. Reconnect the channel.");
    const t = await this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  }
  override async revoke({ accessToken, refreshToken }: { accessToken: string; refreshToken?: string | null }) {
    const res = await platformFetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken ?? accessToken)}`, { method: "POST" }).catch(() => null);
    return { revoked: Boolean(res?.ok) };
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const r = await this.get<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] }>("/channels?part=snippet&mine=true", tokens.accessToken);
    if (!r.items?.length) throw new PlatformError("permission", "This Google account has no YouTube channel.");
    const canUpload = tokens.scopes.length === 0 || tokens.scopes.includes(this.requiredPublishScopes()[0]!);
    return r.items.map((c) => ({
      externalId: c.id,
      displayName: c.snippet.title,
      username: c.snippet.customUrl ?? null,
      avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
      accountType: "channel",
      eligible: canUpload,
      eligibilityReason: canUpload ? undefined : "The youtube.upload permission wasn't granted.",
    }));
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("validation", "YouTube posts need a video.");
    const data = await video.load();
    const tags = [...input.text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!).slice(0, 15);
    const title = (input.title?.trim() || input.text.split("\n")[0] || "New video").replace(/[<>]/g, "").slice(0, 100);
    const privacy = meta(input.account, "privacy") ?? "public";
    const init = await platformFetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: { ...bearer(input.accessToken), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": video.mimeType, "X-Upload-Content-Length": String(data.length) },
      body: JSON.stringify({
        snippet: { title, description: input.text.replace(/[<>]/g, "").slice(0, 5000), tags, categoryId: "22" },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      }),
    });
    if (!init.ok) await this.fail(init);
    const location = init.headers.get("location");
    if (!location) throw new PlatformError("transient", "YouTube didn't return an upload URL.");
    const up = await platformFetch(location, { method: "PUT", headers: { "Content-Type": video.mimeType }, body: new Uint8Array(data), signal: input.signal }, { ambiguous: true, timeoutMs: 30 * 60_000 });
    if (!up.ok) await this.fail(up);
    const v = (await readJson(up)) as { id?: string };
    if (!v.id) throw new PlatformError("ambiguous", "YouTube didn't return a video id. Check YouTube Studio before retrying.");
    return { externalPostId: v.id, url: `https://www.youtube.com/watch?v=${v.id}` };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }): Promise<EngagementInput[]> {
    interface C {
      id: string;
      snippet: { textOriginal?: string; textDisplay?: string; authorDisplayName?: string; authorProfileImageUrl?: string; authorChannelId?: { value?: string }; publishedAt?: string; parentId?: string };
    }
    const r = await this.get<{ items?: { id: string; snippet: { topLevelComment: C }; replies?: { comments?: C[] } }[] }>(
      `/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(postExternalId)}&maxResults=100&order=time`,
      accessToken,
    );
    const toItem = (c: C, kind: "comment" | "reply"): EngagementInput => ({
      externalId: c.id,
      kind,
      postExternalId,
      parentExternalId: c.snippet.parentId ?? postExternalId,
      authorName: c.snippet.authorDisplayName ?? null,
      authorAvatarUrl: c.snippet.authorProfileImageUrl ?? null,
      authorExternalId: c.snippet.authorChannelId?.value ?? null,
      text: c.snippet.textOriginal ?? c.snippet.textDisplay ?? "",
      permalink: `https://www.youtube.com/watch?v=${postExternalId}&lc=${c.id}`,
      occurredAt: toDate(c.snippet.publishedAt),
      // Replies go to the top-level thread id.
      replyTarget: { threadId: c.snippet.parentId ?? c.id },
      isOwn: c.snippet.authorChannelId?.value === account.externalAccountId,
    });
    return (r.items ?? []).flatMap((t) => [toItem(t.snippet.topLevelComment, "comment"), ...(t.replies?.comments ?? []).map((c) => toItem(c, "reply"))]);
  }

  async reply({ accessToken, target, text }: ReplyInput) {
    const res = await platformFetch(`${API}/comments?part=snippet`, {
      method: "POST",
      headers: { ...bearer(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ snippet: { parentId: target.replyTarget.threadId ?? target.externalId, textOriginal: text } }),
    });
    if (!res.ok) await this.fail(res);
    const c = (await readJson(res)) as { id: string };
    return { externalId: c.id };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const ch = await this.get<{ items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(`/channels?part=contentDetails&id=${account.externalAccountId}`, accessToken);
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return [];
    const r = await this.get<{ items?: { contentDetails: { videoId: string; videoPublishedAt?: string }; snippet: { title?: string; thumbnails?: { medium?: { url?: string } } } }[] }>(
      `/playlistItems?part=snippet,contentDetails&playlistId=${uploads}&maxResults=${Math.min(limit, 50)}`,
      accessToken,
    );
    return (r.items ?? []).map((i) => ({
      externalPostId: i.contentDetails.videoId,
      url: `https://www.youtube.com/watch?v=${i.contentDetails.videoId}`,
      text: i.snippet.title ?? null,
      thumbnailUrl: i.snippet.thumbnails?.medium?.url ?? null,
      publishedAt: toDate(i.contentDetails.videoPublishedAt),
    }));
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const r = await this.get<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(`/videos?part=statistics&id=${encodeURIComponent(externalPostId)}`, accessToken);
    const s = r.items?.[0]?.statistics;
    if (!s) return [];
    const n = (v?: string) => (v === undefined ? null : Number(v));
    return [
      { metric: "views", value: n(s.viewCount), availability: "available" },
      { metric: "likes", value: n(s.likeCount), availability: s.likeCount === undefined ? "unsupported" : "available" },
      { metric: "comments", value: n(s.commentCount), availability: "available" },
    ];
  }

  async fetchAccountStats({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const r = await this.get<{ items?: { statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }[] }>(`/channels?part=statistics&id=${account.externalAccountId}`, accessToken);
    const s = r.items?.[0]?.statistics;
    return { followers: s?.subscriberCount ? Number(s.subscriberCount) : null, views: s?.viewCount ? Number(s.viewCount) : null, posts: s?.videoCount ? Number(s.videoCount) : null };
  }
}
