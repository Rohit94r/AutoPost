import "server-only";
import { env } from "@/server/env";
import { errorFromStatus, expiresAtFrom, platformFetch, readJson, retryAfterFrom, sleep } from "./http";
import { PlatformError, type ConnectedProfile, type MetricValue, type PlatformAdapter, type PublishInput, type PublishResult, type TokenSet } from "./types";

/**
 * X adapter — OAuth 2.0 Authorization Code with PKCE + X API v2 (posts, v2 media upload).
 * Docs: docs.x.com/x-api/posts/create-post, docs.x.com/x-api/media/upload-media
 * X uses pay-per-use pricing; posts containing URLs cost more (surfaced in the composer).
 */
const AUTH_URL = "https://x.com/i/oauth2/authorize";
const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

export class XAdapter implements PlatformAdapter {
  readonly platform = "x" as const;
  readonly usesPkce = true;

  private get cfg() {
    const e = env();
    return { id: e.X_CLIENT_ID, secret: e.X_CLIENT_SECRET, metrics: e.ANALYTICS_X_ENABLED };
  }

  isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }

  requestedScopes() {
    return ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
  }

  requiredPublishScopes() {
    return ["tweet.write", "users.read"];
  }

  private basic() {
    return `Basic ${Buffer.from(`${this.cfg.id}:${this.cfg.secret}`).toString("base64")}`;
  }

  private async fail(res: Response): Promise<never> {
    const body = (await readJson(res)) as { detail?: string; title?: string; error_description?: string; errors?: { message?: string }[]; type?: string };
    const msg = body.detail ?? body.error_description ?? body.errors?.[0]?.message ?? body.title ?? "";
    const requestId = res.headers.get("x-transaction-id");
    if (res.status === 402 || /credits|client-not-enrolled|not enrolled|access level/i.test(`${msg} ${body.type ?? ""}`)) {
      throw new PlatformError("permission", `X API access problem: ${msg || "insufficient credits or access level"}. Check your X developer account billing/plan.`, { status: res.status, requestId });
    }
    if (res.status === 403 && /duplicate/i.test(msg)) {
      throw new PlatformError("validation", "X rejected this as duplicate content (an identical post already exists).", { status: res.status, requestId });
    }
    if (res.status === 429) throw new PlatformError("rate_limit", "X rate limit reached. Will retry after the reset window.", { status: 429, retryAfterSec: retryAfterFrom(res, 900), requestId });
    if (res.status === 400 && /invalid_grant|invalid_request/i.test(JSON.stringify(body))) {
      throw new PlatformError("auth", "X authorization is invalid or expired. Reconnect the account.", { status: 400, requestId });
    }
    throw errorFromStatus(res.status, msg ? `X: ${msg}` : "", res, requestId);
  }

  buildAuthorizeUrl({ state, redirectUri, codeChallenge }: { state: string; redirectUri: string; codeChallenge?: string }) {
    if (!codeChallenge) throw new Error("PKCE code challenge required for X");
    const u = new URL(AUTH_URL);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", this.requestedScopes().join(" "));
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    return u.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await platformFetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    if (!res.ok) await this.fail(res);
    const b = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!b.access_token) throw new PlatformError("auth", "X did not return an access token.");
    return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: expiresAtFrom(b.expires_in), scopes: (b.scope ?? "").split(" ").filter(Boolean) };
  }

  exchangeCode({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string }) {
    if (!codeVerifier) throw new PlatformError("auth", "Missing PKCE verifier.");
    return this.token({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: codeVerifier });
  }

  canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }

  /** Always persist the returned refresh token — X may rotate it. */
  refresh({ refreshToken }: { refreshToken?: string | null }) {
    if (!refreshToken) throw new PlatformError("auth", "No X refresh token. Reconnect the account.");
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const res = await platformFetch(`${API}/users/me?user.fields=profile_image_url,username,name`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    if (!res.ok) await this.fail(res);
    const { data } = (await readJson(res)) as { data?: { id: string; name: string; username: string; profile_image_url?: string } };
    if (!data?.id) throw new PlatformError("auth", "X did not return the user id.");
    const canPost = tokens.scopes.length === 0 || tokens.scopes.includes("tweet.write");
    return [
      {
        externalId: data.id,
        displayName: data.name,
        username: data.username,
        avatarUrl: data.profile_image_url ?? null,
        accountType: "user",
        eligible: canPost,
        eligibilityReason: canPost ? undefined : "The tweet.write permission was not granted.",
        metadata: { mediaWrite: tokens.scopes.includes("media.write") },
      },
    ];
  }

  async revoke({ accessToken, refreshToken }: { accessToken: string; refreshToken?: string | null }) {
    let revoked = false;
    for (const [token, hint] of [
      [refreshToken, "refresh_token"],
      [accessToken, "access_token"],
    ] as const) {
      if (!token) continue;
      try {
        const res = await platformFetch(`${API}/oauth2/revoke`, {
          method: "POST",
          headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token, token_type_hint: hint }),
        });
        revoked ||= res.ok;
      } catch {
        /* best effort */
      }
    }
    return { revoked };
  }

  private async uploadMedia(token: string, media: PublishInput["media"][number], signal?: AbortSignal): Promise<string> {
    const data = await media.load();
    const auth = { Authorization: `Bearer ${token}` };
    if (media.kind === "image" && data.length <= 5 * 1024 * 1024) {
      const form = new FormData();
      form.append("media", new Blob([new Uint8Array(data)], { type: media.mimeType }), "upload");
      form.append("media_category", media.mimeType === "image/gif" ? "tweet_gif" : "tweet_image");
      const res = await platformFetch(`${API}/media/upload`, { method: "POST", headers: auth, body: form, signal }, { timeoutMs: 120_000 });
      if (!res.ok) await this.fail(res);
      const { data: d } = (await readJson(res)) as { data?: { id?: string } };
      if (!d?.id) throw new PlatformError("media", "X did not return a media id.");
      return d.id;
    }

    const category = media.kind === "video" ? "tweet_video" : media.mimeType === "image/gif" ? "tweet_gif" : "tweet_image";
    const init = await platformFetch(`${API}/media/upload/initialize`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: media.mimeType, total_bytes: data.length, media_category: category }),
      signal,
    });
    if (!init.ok) await this.fail(init);
    const id = ((await readJson(init)) as { data?: { id?: string } }).data?.id;
    if (!id) throw new PlatformError("media", "X did not return a media upload id.");

    for (let i = 0, seg = 0; i < data.length; i += CHUNK, seg++) {
      const form = new FormData();
      form.append("segment_index", String(seg));
      form.append("media", new Blob([new Uint8Array(data.subarray(i, i + CHUNK))]), "chunk");
      const res = await platformFetch(`${API}/media/upload/${id}/append`, { method: "POST", headers: auth, body: form, signal }, { timeoutMs: 180_000 });
      if (!res.ok) await this.fail(res);
    }

    const fin = await platformFetch(`${API}/media/upload/${id}/finalize`, { method: "POST", headers: auth, signal });
    if (!fin.ok) await this.fail(fin);
    let info = ((await readJson(fin)) as { data?: { processing_info?: { state?: string; check_after_secs?: number } } }).data?.processing_info;
    for (let i = 0; info && info.state !== "succeeded" && i < 60; i++) {
      if (info.state === "failed") throw new PlatformError("media", "X could not process the media file.");
      await sleep(Math.max(1, info.check_after_secs ?? 5) * 1000, signal);
      const st = await platformFetch(`${API}/media/upload?command=STATUS&media_id=${id}`, { headers: auth, signal });
      if (!st.ok) await this.fail(st);
      info = ((await readJson(st)) as { data?: { processing_info?: { state?: string; check_after_secs?: number } } }).data?.processing_info;
    }
    if (info && info.state !== "succeeded") throw new PlatformError("transient", "X is still processing the media. Will retry.");
    return id;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (input.media.length > 4) throw new PlatformError("validation", "X allows up to 4 media items.");
    if (input.media.some((m) => m.kind === "video") && input.media.length > 1) {
      throw new PlatformError("validation", "X allows one video per post (without other media).");
    }
    const mediaIds: string[] = [];
    for (const m of input.media) mediaIds.push(await this.uploadMedia(input.accessToken, m, input.signal));
    const body: Record<string, unknown> = { text: input.text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };
    const res = await platformFetch(
      `${API}/tweets`,
      { method: "POST", headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { ambiguous: true, timeoutMs: 60_000 },
    );
    if (!res.ok) await this.fail(res);
    const { data } = (await readJson(res)) as { data?: { id?: string } };
    if (!data?.id) throw new PlatformError("ambiguous", "X did not return a post id. Check your profile before retrying.");
    const handle = input.account.username;
    return {
      externalPostId: data.id,
      url: handle ? `https://x.com/${handle}/status/${data.id}` : `https://x.com/i/web/status/${data.id}`,
      platformRequestId: res.headers.get("x-transaction-id"),
    };
  }

  async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const names = { impressions: "impression_count", likes: "like_count", replies: "reply_count", reposts: "retweet_count", quotes: "quote_count", bookmarks: "bookmark_count" } as const;
    if (!this.cfg.metrics) {
      return Object.keys(names).map((metric) => ({
        metric,
        value: null,
        availability: "unavailable" as const,
        note: "X metrics collection is off (each read is billed). Set ANALYTICS_X_ENABLED=true to enable.",
      }));
    }
    const res = await platformFetch(`${API}/tweets/${externalPostId}?tweet.fields=public_metrics`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const availability = res.status === 403 || res.status === 402 ? "permission_missing" : "unavailable";
      return Object.keys(names).map((metric) => ({ metric, value: null, availability }));
    }
    const pm = ((await readJson(res)) as { data?: { public_metrics?: Record<string, number> } }).data?.public_metrics ?? {};
    return Object.entries(names).map(([metric, key]) =>
      typeof pm[key] === "number" ? { metric, value: pm[key]!, availability: "available" as const } : { metric, value: null, availability: "unsupported" as const },
    );
  }
}
