import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, meta } from "./base";
import { bearer, errorFromStatus, expiresAtFrom, platformFetch, readJson, sleep } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type TokenSet } from "./types";

/**
 * TikTok Content Posting API (Direct Post) with Login Kit OAuth.
 * Unaudited apps can only post SELF_ONLY (private) videos — the creator's allowed privacy
 * options are read from creator_info before every post.
 * Docs: developers.tiktok.com/doc/content-posting-api-get-started
 */
const API = "https://open.tiktokapis.com/v2";
const CHUNK = 10 * 1024 * 1024;

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

export class TikTokAdapter extends BaseAdapter {
  readonly platform = "tiktok" as const;

  private get cfg() {
    const e = env();
    return { key: e.TIKTOK_CLIENT_KEY, secret: e.TIKTOK_CLIENT_SECRET };
  }
  override isConfigured() {
    return Boolean(this.cfg.key && this.cfg.secret);
  }
  override requestedScopes() {
    return ["user.info.basic", "user.info.profile", "user.info.stats", "video.publish", "video.list"];
  }
  override requiredPublishScopes() {
    return ["video.publish"];
  }

  private async call<T>(path: string, token: string, body?: unknown, opts: { ambiguous?: boolean; method?: string } = {}): Promise<T> {
    const res = await platformFetch(
      `${API}${path}`,
      { method: opts.method ?? (body === undefined ? "GET" : "POST"), headers: { ...bearer(token), "Content-Type": "application/json; charset=UTF-8" }, body: body === undefined ? undefined : JSON.stringify(body) },
      { timeoutMs: 60_000, ambiguous: opts.ambiguous },
    );
    const b = (await readJson(res)) as TikTokEnvelope<T>;
    const code = b.error?.code;
    if (res.ok && (!code || code === "ok")) return b.data as T;
    const msg = `TikTok: ${b.error?.message || code || res.status}`;
    if (code === "access_token_invalid" || code === "scope_not_authorized" || res.status === 401) {
      throw new PlatformError(code === "scope_not_authorized" ? "permission" : "auth", code === "scope_not_authorized" ? `${msg}. Reconnect and approve all permissions.` : "TikTok access expired. Reconnect the account.");
    }
    if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts" || res.status === 429) throw new PlatformError("rate_limit", msg, { retryAfterSec: 3600 });
    if (code === "url_ownership_unverified") throw new PlatformError("permission", "TikTok needs your media domain verified in the TikTok developer portal (or use direct upload).");
    if (code === "unaudited_client_can_only_post_to_private_accounts") throw new PlatformError("permission", "Until TikTok audits this app, posting only works when the TikTok account is set to private.");
    throw errorFromStatus(res.status >= 400 ? res.status : 400, msg, res, b.error?.log_id);
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.searchParams.set("client_key", this.cfg.key!);
    u.searchParams.set("scope", this.requestedScopes().join(","));
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await platformFetch(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: this.cfg.key!, client_secret: this.cfg.secret!, ...params }),
    });
    const b = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; scope?: string; open_id?: string; error?: string; error_description?: string };
    if (!res.ok || !b.access_token) throw new PlatformError("auth", `TikTok sign-in failed: ${b.error_description ?? b.error ?? res.status}`);
    return {
      accessToken: b.access_token,
      refreshToken: b.refresh_token ?? null,
      expiresAt: expiresAtFrom(b.expires_in),
      refreshTokenExpiresAt: expiresAtFrom(b.refresh_expires_in),
      scopes: (b.scope ?? "").split(",").filter(Boolean),
      userId: b.open_id ?? null,
    };
  }

  override exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }) {
    return this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  }
  override canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }
  override refresh({ refreshToken }: { refreshToken?: string | null }) {
    if (!refreshToken) throw new PlatformError("auth", "No TikTok refresh token. Reconnect.");
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }
  override async revoke({ accessToken }: { accessToken: string }) {
    const res = await platformFetch(`${API}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: this.cfg.key!, client_secret: this.cfg.secret!, token: accessToken }),
    }).catch(() => null);
    return { revoked: Boolean(res?.ok) };
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const d = await this.call<{ user: { open_id: string; display_name?: string; username?: string; avatar_url?: string } }>("/user/info/?fields=open_id,display_name,username,avatar_url", tokens.accessToken);
    const canPost = tokens.scopes.length === 0 || tokens.scopes.includes("video.publish");
    return [
      {
        externalId: d.user.open_id,
        displayName: d.user.display_name || d.user.username || "TikTok account",
        username: d.user.username ?? null,
        avatarUrl: d.user.avatar_url ?? null,
        accountType: "creator",
        eligible: canPost,
        eligibilityReason: canPost ? undefined : "The video.publish permission wasn't granted.",
      },
    ];
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("validation", "TikTok posts need a video.");
    const creator = await this.call<{ privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean }>("/post/publish/creator_info/query/", input.accessToken, {});
    const options = creator.privacy_level_options ?? ["SELF_ONLY"];
    const wanted = meta(input.account, "tiktokPrivacy") ?? "PUBLIC_TO_EVERYONE";
    const privacy = options.includes(wanted) ? wanted : options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0]!;
    const data = await video.load();
    const chunk = data.length <= CHUNK ? data.length : CHUNK;
    const total = Math.floor(data.length / chunk);
    const init = await this.call<{ publish_id: string; upload_url: string }>(
      "/post/publish/video/init/",
      input.accessToken,
      {
        post_info: {
          title: input.text.slice(0, 2200),
          privacy_level: privacy,
          disable_comment: Boolean(creator.comment_disabled),
          disable_duet: Boolean(creator.duet_disabled),
          disable_stitch: Boolean(creator.stitch_disabled),
        },
        source_info: { source: "FILE_UPLOAD", video_size: data.length, chunk_size: chunk, total_chunk_count: total },
      },
      { ambiguous: true },
    );
    for (let i = 0; i < total; i++) {
      const start = i * chunk;
      const end = i === total - 1 ? data.length : start + chunk;
      const res = await platformFetch(
        init.upload_url,
        { method: "PUT", headers: { "Content-Type": video.mimeType, "Content-Range": `bytes ${start}-${end - 1}/${data.length}` }, body: new Uint8Array(data.subarray(start, end)), signal: input.signal },
        { timeoutMs: 10 * 60_000 },
      );
      if (!res.ok && res.status !== 206) throw new PlatformError("transient", `TikTok upload failed (HTTP ${res.status}).`);
    }
    // Poll until TikTok accepts the post. The public post id appears only after moderation.
    for (let i = 0; i < 60; i++) {
      const st = await this.call<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>("/post/publish/status/fetch/", input.accessToken, { publish_id: init.publish_id });
      if (st.status === "FAILED") throw new PlatformError("media", `TikTok rejected the video: ${st.fail_reason ?? "unknown reason"}`);
      if (st.status === "PUBLISH_COMPLETE") {
        const id = st.publicaly_available_post_id?.[0];
        return {
          externalPostId: id ? String(id) : init.publish_id,
          url: id && input.account.username ? `https://www.tiktok.com/@${input.account.username}/video/${id}` : null,
        };
      }
      await sleep(5000, input.signal);
    }
    // Still processing: TikTok has the video; record the publish id (not an error, never re-posted).
    return { externalPostId: init.publish_id, url: null };
  }

  async fetchRecentPosts({ accessToken, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const d = await this.call<{ videos?: { id: string; title?: string; share_url?: string; cover_image_url?: string; create_time?: number }[] }>(
      "/video/list/?fields=id,title,share_url,cover_image_url,create_time",
      accessToken,
      { max_count: Math.min(limit, 20) },
    );
    return (d.videos ?? []).map((v) => ({ externalPostId: v.id, url: v.share_url ?? null, text: v.title ?? null, thumbnailUrl: v.cover_image_url ?? null, publishedAt: new Date((v.create_time ?? 0) * 1000) }));
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    if (!/^\d+$/.test(externalPostId)) return []; // still a publish id: not yet public
    const d = await this.call<{ videos?: { view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] }>(
      "/video/query/?fields=id,view_count,like_count,comment_count,share_count",
      accessToken,
      { filters: { video_ids: [externalPostId] } },
    );
    const v = d.videos?.[0];
    if (!v) return [];
    return [
      { metric: "views", value: v.view_count ?? null, availability: "available" },
      { metric: "likes", value: v.like_count ?? null, availability: "available" },
      { metric: "comments", value: v.comment_count ?? null, availability: "available" },
      { metric: "shares", value: v.share_count ?? null, availability: "available" },
    ];
  }

  async fetchAccountStats({ accessToken }: { accessToken: string }): Promise<AccountStats> {
    const d = await this.call<{ user: { follower_count?: number; following_count?: number; likes_count?: number; video_count?: number } }>(
      "/user/info/?fields=follower_count,following_count,likes_count,video_count",
      accessToken,
    );
    return { followers: d.user.follower_count ?? null, following: d.user.following_count ?? null, likes: d.user.likes_count ?? null, posts: d.user.video_count ?? null };
  }
}
