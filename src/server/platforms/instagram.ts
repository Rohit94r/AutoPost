import "server-only";
import { env } from "@/server/env";
import { errorFromStatus, expiresAtFrom, platformFetch, readJson, sleep } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type EngagementInput, type MetricValue, type PlatformAdapter, type PublishInput, type PublishResult, type RemotePost, type ReplyInput, type TokenSet } from "./types";

/**
 * Instagram adapter — Instagram API with Instagram Login (professional accounts only).
 * Docs: developers.facebook.com/docs/instagram-platform/content-publishing
 */
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string; fbtrace_id?: string };
}

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = "instagram" as const;
  readonly usesPkce = false;

  private get cfg() {
    const e = env();
    return { id: e.INSTAGRAM_APP_ID, secret: e.INSTAGRAM_APP_SECRET, version: e.INSTAGRAM_GRAPH_VERSION };
  }

  private get base() {
    return `${GRAPH}/${this.cfg.version}`;
  }

  isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }

  requestedScopes() {
    const e = env();
    return [
      "instagram_business_basic",
      "instagram_business_content_publish",
      ...(e.INSTAGRAM_REQUEST_COMMENTS ? ["instagram_business_manage_comments"] : []),
      ...(e.INSTAGRAM_REQUEST_INSIGHTS ? ["instagram_business_manage_insights"] : []),
    ];
  }

  requiredPublishScopes() {
    return ["instagram_business_basic", "instagram_business_content_publish"];
  }

  private async fail(res: Response): Promise<never> {
    const body = (await readJson(res)) as GraphError;
    const e = body.error;
    const requestId = e?.fbtrace_id ?? null;
    const msg = e?.error_user_msg || e?.message || "";
    const code = e?.code;
    if (code === 190 || res.status === 401) throw new PlatformError("auth", "Instagram session expired or was revoked. Reconnect the account.", { status: res.status, code: String(code), requestId });
    if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
      throw new PlatformError("permission", `Instagram permission missing: ${msg}`, { status: res.status, code: String(code), requestId });
    }
    if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) {
      throw new PlatformError("rate_limit", "Instagram rate limit reached. Will retry later.", { status: res.status, code: String(code), retryAfterSec: 900, requestId });
    }
    if (code === 9007 || code === 2) throw new PlatformError("transient", `Instagram: ${msg || "media not ready"}`, { status: res.status, code: String(code), requestId });
    if (code === 36003 || code === 9004 || code === 2207026 || e?.error_subcode?.toString().startsWith("2207")) {
      throw new PlatformError("media", `Instagram rejected the media: ${msg}`, { status: res.status, code: String(code), requestId });
    }
    throw errorFromStatus(res.status, msg ? `Instagram: ${msg}` : "", res, requestId);
  }

  buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.requestedScopes().join(","));
    u.searchParams.set("state", state);
    return u.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<TokenSet> {
    const res = await platformFetch(SHORT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.cfg.id!, client_secret: this.cfg.secret!, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });
    if (!res.ok) await this.fail(res);
    const raw = (await readJson(res)) as { access_token?: string; user_id?: string | number; permissions?: string | string[]; data?: { access_token: string; user_id: string | number; permissions?: string | string[] }[] };
    const short = raw.data?.[0] ?? raw;
    if (!short.access_token) throw new PlatformError("auth", "Instagram did not return an access token.");
    const perms = Array.isArray(short.permissions) ? short.permissions : (short.permissions ?? "").split(",").filter(Boolean);

    const longUrl = new URL(`${GRAPH}/access_token`);
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", this.cfg.secret!);
    longUrl.searchParams.set("access_token", short.access_token);
    const longRes = await platformFetch(longUrl.toString(), {});
    if (!longRes.ok) await this.fail(longRes);
    const long = (await readJson(longRes)) as { access_token?: string; expires_in?: number };
    if (!long.access_token) throw new PlatformError("auth", "Instagram did not return a long-lived token.");
    return {
      accessToken: long.access_token,
      refreshToken: null,
      expiresAt: expiresAtFrom(long.expires_in),
      scopes: perms.map((p) => p.trim()),
      userId: short.user_id !== undefined ? String(short.user_id) : null,
    };
  }

  /** Long-lived tokens can be refreshed once they're ≥ 24h old and not yet expired. */
  canRefresh(t: { tokenExpiresAt?: Date | null; lastRefreshedAt?: Date | null; createdAt?: Date }) {
    const issued = t.lastRefreshedAt ?? t.createdAt;
    const oldEnough = !issued || Date.now() - issued.getTime() > 24 * 3600_000;
    const notExpired = !t.tokenExpiresAt || t.tokenExpiresAt.getTime() > Date.now();
    return oldEnough && notExpired;
  }

  async refresh({ accessToken }: { accessToken: string }): Promise<TokenSet> {
    const u = new URL(`${GRAPH}/refresh_access_token`);
    u.searchParams.set("grant_type", "ig_refresh_token");
    u.searchParams.set("access_token", accessToken);
    const res = await platformFetch(u.toString(), {});
    if (!res.ok) await this.fail(res);
    const b = (await readJson(res)) as { access_token?: string; expires_in?: number };
    if (!b.access_token) throw new PlatformError("auth", "Instagram did not return a refreshed token.");
    return { accessToken: b.access_token, refreshToken: null, expiresAt: expiresAtFrom(b.expires_in), scopes: [] };
  }

  async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const res = await platformFetch(`${this.base}/me?fields=user_id,username,name,account_type,profile_picture_url`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) await this.fail(res);
    const raw = (await readJson(res)) as Record<string, unknown> & { data?: Record<string, unknown>[] };
    const me = (raw.data?.[0] ?? raw) as { user_id?: string | number; id?: string; username?: string; name?: string; account_type?: string; profile_picture_url?: string };
    const id = String(me.user_id ?? tokens.userId ?? me.id ?? "");
    if (!id) throw new PlatformError("auth", "Instagram did not return the account id.");
    const type = (me.account_type ?? "").toUpperCase();
    const professional = type === "BUSINESS" || type === "MEDIA_CREATOR" || type === "CREATOR";
    const hasPublish = tokens.scopes.length === 0 || tokens.scopes.includes("instagram_business_content_publish");
    return [
      {
        externalId: id,
        displayName: me.name || me.username || "Instagram account",
        username: me.username ?? null,
        avatarUrl: me.profile_picture_url ?? null,
        accountType: professional ? (type === "BUSINESS" ? "business" : "creator") : "personal",
        eligible: professional && hasPublish,
        eligibilityReason: !professional
          ? "Only Instagram professional (Business or Creator) accounts can publish through the API."
          : !hasPublish
            ? "The instagram_business_content_publish permission was not granted."
            : undefined,
        metadata: { accountTypeRaw: type },
      },
    ];
  }

  async revoke() {
    return { revoked: false, note: "Instagram Login has no token revocation endpoint. Remove the app in Instagram > Settings > Apps and websites." };
  }

  private auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** Reads the account's rolling 24h publishing quota (docs disagree on the number, so we ask). */
  async publishingQuota(token: string, igId: string) {
    const res = await platformFetch(`${this.base}/${igId}/content_publishing_limit?fields=quota_usage,config`, { headers: this.auth(token) });
    if (!res.ok) return null;
    const b = (await readJson(res)) as { data?: { quota_usage?: number; config?: { quota_total?: number } }[] };
    const d = b.data?.[0];
    return d ? { used: d.quota_usage ?? 0, total: d.config?.quota_total ?? null } : null;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const igId = input.account.externalAccountId;
    const token = input.accessToken;
    if (input.media.length !== 1) throw new PlatformError("validation", "Instagram posts need exactly one image or video here.");
    const media = input.media[0]!;
    if (media.kind === "image" && media.mimeType !== "image/jpeg") {
      throw new PlatformError("validation", "Instagram only accepts JPEG images for API publishing.");
    }

    const quota = await this.publishingQuota(token, igId);
    if (quota?.total && quota.used >= quota.total) {
      throw new PlatformError("rate_limit", `Instagram's daily publishing limit (${quota.total} posts / 24h) is reached.`, { retryAfterSec: 3600 });
    }

    const mediaUrl = await media.publicUrl(media.kind === "video" ? 6 * 3600 : 3600);
    const params = new URLSearchParams({ caption: input.text });
    if (media.kind === "image") {
      params.set("image_url", mediaUrl);
      if (media.altText) params.set("alt_text", media.altText.slice(0, 1000));
    } else {
      params.set("media_type", "REELS");
      params.set("video_url", mediaUrl);
      params.set("share_to_feed", "true");
    }
    const create = await platformFetch(`${this.base}/${igId}/media`, {
      method: "POST",
      headers: { ...this.auth(token), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!create.ok) await this.fail(create);
    const { id: containerId } = (await readJson(create)) as { id?: string };
    if (!containerId) throw new PlatformError("media", "Instagram did not return a media container id.");

    // Wait for the container to finish processing.
    const maxPolls = media.kind === "video" ? 60 : 24;
    const interval = media.kind === "video" ? 10_000 : 5_000;
    for (let i = 0; ; i++) {
      const st = await platformFetch(`${this.base}/${containerId}?fields=status_code,status`, { headers: this.auth(token) });
      if (!st.ok) await this.fail(st);
      const s = (await readJson(st)) as { status_code?: string; status?: string };
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "PUBLISHED") throw new PlatformError("ambiguous", "This Instagram container was already published. Check your profile.");
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
        throw new PlatformError("media", `Instagram could not process the media (${s.status ?? s.status_code}). Check the format requirements and that the media URL is publicly reachable.`);
      }
      if (i >= maxPolls) throw new PlatformError("transient", "Instagram is still processing the media. Will retry.");
      await sleep(interval, input.signal);
    }

    const pub = await platformFetch(
      `${this.base}/${igId}/media_publish`,
      { method: "POST", headers: { ...this.auth(token), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ creation_id: containerId }) },
      { ambiguous: true, timeoutMs: 60_000 },
    );
    if (!pub.ok) await this.fail(pub);
    const { id: mediaId } = (await readJson(pub)) as { id?: string };
    if (!mediaId) throw new PlatformError("ambiguous", "Instagram did not return a media id. Check your profile before retrying.");

    let url: string | null = null;
    try {
      const p = await platformFetch(`${this.base}/${mediaId}?fields=permalink`, { headers: this.auth(token) });
      if (p.ok) url = ((await readJson(p)) as { permalink?: string }).permalink ?? null;
    } catch {
      /* permalink is optional */
    }
    return { externalPostId: mediaId, url };
  }

  async fetchMetrics({ accessToken, externalPostId, grantedScopes }: { accessToken: string; externalPostId: string; grantedScopes: string[] }): Promise<MetricValue[]> {
    const metrics = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"];
    if (grantedScopes.length && !grantedScopes.includes("instagram_business_manage_insights")) {
      return metrics.map((metric) => ({ metric, value: null, availability: "permission_missing" as const, note: "Requires instagram_business_manage_insights." }));
    }
    const fetchSome = async (list: string[]) => {
      const res = await platformFetch(`${this.base}/${externalPostId}/insights?metric=${list.join(",")}`, { headers: this.auth(accessToken) });
      if (!res.ok) return null;
      const b = (await readJson(res)) as { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
      return b.data ?? [];
    };
    const all = await fetchSome(metrics);
    if (all) {
      return metrics.map((metric) => {
        const d = all.find((x) => x.name === metric);
        const value = d?.total_value?.value ?? d?.values?.[0]?.value;
        return value === undefined ? { metric, value: null, availability: "unsupported" as const } : { metric, value, availability: "available" as const };
      });
    }
    // Some metrics are invalid for some media types; fall back to one-by-one.
    const out: MetricValue[] = [];
    for (const metric of metrics) {
      const d = await fetchSome([metric]);
      const value = d?.[0]?.total_value?.value ?? d?.[0]?.values?.[0]?.value;
      out.push(value === undefined ? { metric, value: null, availability: "unsupported" } : { metric, value, availability: "available" });
    }
    return out;
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }): Promise<EngagementInput[]> {
    interface C {
      id: string;
      text?: string;
      timestamp?: string;
      username?: string;
      from?: { id?: string; username?: string };
      replies?: { data?: C[] };
    }
    const res = await platformFetch(
      `${this.base}/${postExternalId}/comments?fields=id,text,timestamp,username,from,replies{id,text,timestamp,username,from}&limit=50`,
      { headers: this.auth(accessToken) },
    );
    if (!res.ok) await this.fail(res);
    const body = (await readJson(res)) as { data?: C[] };
    const own = account.username;
    const toItem = (c: C, kind: "comment" | "reply", parent: string): EngagementInput => ({
      externalId: c.id,
      kind,
      postExternalId,
      parentExternalId: parent,
      authorName: c.username ?? c.from?.username ?? null,
      authorHandle: c.username ?? c.from?.username ?? null,
      authorExternalId: c.from?.id ?? null,
      text: c.text ?? "",
      permalink: null,
      occurredAt: c.timestamp ? new Date(c.timestamp) : new Date(),
      // Instagram replies attach to the top-level comment.
      replyTarget: { topCommentId: kind === "reply" ? parent : c.id },
      isOwn: Boolean(own && (c.username ?? c.from?.username) === own),
    });
    return (body.data ?? []).flatMap((c) => [toItem(c, "comment", postExternalId), ...(c.replies?.data ?? []).map((r) => toItem(r, "reply", c.id))]);
  }

  async reply({ accessToken, target, text }: ReplyInput) {
    const commentId = target.replyTarget.topCommentId ?? target.externalId;
    const res = await platformFetch(`${this.base}/${commentId}/replies`, {
      method: "POST",
      headers: { ...this.auth(accessToken), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message: text }),
    });
    if (!res.ok) await this.fail(res);
    const { id } = (await readJson(res)) as { id?: string };
    if (!id) throw new PlatformError("ambiguous", "Instagram didn't confirm the reply.");
    return { externalId: id };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const res = await platformFetch(
      `${this.base}/${account.externalAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${Math.min(limit, 50)}`,
      { headers: this.auth(accessToken) },
    );
    if (!res.ok) await this.fail(res);
    const body = (await readJson(res)) as { data?: { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }[] };
    return (body.data ?? []).map((m) => ({
      externalPostId: m.id,
      url: m.permalink ?? null,
      text: m.caption ?? null,
      thumbnailUrl: m.media_type === "VIDEO" ? (m.thumbnail_url ?? null) : (m.media_url ?? null),
      publishedAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    }));
  }

  async fetchAccountStats({ accessToken }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const res = await platformFetch(`${this.base}/me?fields=followers_count,follows_count,media_count`, { headers: this.auth(accessToken) });
    if (!res.ok) await this.fail(res);
    const raw = (await readJson(res)) as Record<string, unknown> & { data?: Record<string, unknown>[] };
    const me = (raw.data?.[0] ?? raw) as { followers_count?: number; follows_count?: number; media_count?: number };
    return { followers: me.followers_count ?? null, following: me.follows_count ?? null, posts: me.media_count ?? null };
  }

}
