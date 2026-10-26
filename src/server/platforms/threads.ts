import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, toDate } from "./base";
import { bearer, errorFromStatus, expiresAtFrom, platformFetch, readJson, sleep } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type ReplyInput, type TokenSet } from "./types";

/**
 * Threads API (Meta). Container → publish flow like Instagram; replies use reply_to_id.
 * Docs: developers.facebook.com/docs/threads (base URL graph.threads.com).
 */
const GRAPH = "https://graph.threads.com";
const API = `${GRAPH}/v1.0`;

interface ThreadsPost {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_url?: string;
  thumbnail_url?: string;
  replied_to?: { id: string };
  is_reply?: boolean;
}

export class ThreadsAdapter extends BaseAdapter {
  readonly platform = "threads" as const;

  private get cfg() {
    const e = env();
    return { id: e.THREADS_APP_ID, secret: e.THREADS_APP_SECRET };
  }
  override isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }
  override requestedScopes() {
    return ["threads_basic", "threads_content_publish", "threads_read_replies", "threads_manage_replies", "threads_manage_insights", "threads_manage_mentions"];
  }
  override requiredPublishScopes() {
    return ["threads_basic", "threads_content_publish"];
  }

  private async fail(res: Response): Promise<never> {
    const e = ((await readJson(res)) as { error?: { message?: string; code?: number; error_user_msg?: string } }).error;
    const msg = e?.error_user_msg || e?.message || "";
    if (e?.code === 190 || res.status === 401) throw new PlatformError("auth", "Threads access expired. Reconnect the account.");
    if (e?.code === 10 || (e?.code !== undefined && e.code >= 200 && e.code <= 299)) throw new PlatformError("permission", `Threads permission missing: ${msg}`);
    if (e?.code === 4 || e?.code === 17 || e?.code === 32 || e?.code === 613) throw new PlatformError("rate_limit", `Threads: ${msg || "rate limited"}`, { retryAfterSec: 900 });
    throw errorFromStatus(res.status, msg ? `Threads: ${msg}` : "", res);
  }

  private async call<T>(path: string, token: string, init: { method?: string; params?: Record<string, string> } = {}, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const isPost = init.method === "POST";
    const url = isPost ? `${API}${path}` : `${API}${path}`;
    const res = await platformFetch(
      url,
      isPost ? { method: "POST", headers: { ...bearer(token), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(init.params ?? {}) } : { headers: bearer(token) },
      { timeoutMs: 60_000, ...opts },
    );
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL("https://threads.com/oauth/authorize");
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", this.requestedScopes().join(","));
    u.searchParams.set("response_type", "code");
    u.searchParams.set("state", state);
    return u.toString();
  }

  override async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<TokenSet> {
    const res = await platformFetch(`${GRAPH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.cfg.id!, client_secret: this.cfg.secret!, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    if (!res.ok) await this.fail(res);
    const short = (await readJson(res)) as { access_token?: string; user_id?: string | number };
    if (!short.access_token) throw new PlatformError("auth", "Threads did not return an access token.");
    const q = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: this.cfg.secret!, access_token: short.access_token });
    const lres = await platformFetch(`${GRAPH}/access_token?${q}`, {});
    if (!lres.ok) await this.fail(lres);
    const long = (await readJson(lres)) as { access_token?: string; expires_in?: number };
    return { accessToken: long.access_token ?? short.access_token, refreshToken: null, expiresAt: expiresAtFrom(long.expires_in), scopes: this.requestedScopes(), userId: short.user_id ? String(short.user_id) : null };
  }

  override canRefresh(t: { tokenExpiresAt?: Date | null; lastRefreshedAt?: Date | null; createdAt?: Date }) {
    const issued = t.lastRefreshedAt ?? t.createdAt;
    return (!issued || Date.now() - issued.getTime() > 24 * 3600_000) && (!t.tokenExpiresAt || t.tokenExpiresAt.getTime() > Date.now());
  }

  override async refresh({ accessToken }: { accessToken: string }): Promise<TokenSet> {
    const q = new URLSearchParams({ grant_type: "th_refresh_token", access_token: accessToken });
    const res = await platformFetch(`${GRAPH}/refresh_access_token?${q}`, {});
    if (!res.ok) await this.fail(res);
    const b = (await readJson(res)) as { access_token?: string; expires_in?: number };
    if (!b.access_token) throw new PlatformError("auth", "Threads did not return a refreshed token.");
    return { accessToken: b.access_token, refreshToken: null, expiresAt: expiresAtFrom(b.expires_in), scopes: [] };
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const me = await this.call<{ id: string; username: string; name?: string; threads_profile_picture_url?: string }>("/me?fields=id,username,name,threads_profile_picture_url", tokens.accessToken);
    return [{ externalId: me.id, displayName: me.name || me.username, username: me.username, avatarUrl: me.threads_profile_picture_url ?? null, accountType: "user", eligible: true }];
  }

  /** Create a container, wait until it's FINISHED, then publish it. */
  private async createAndPublish(userId: string, token: string, params: Record<string, string>, signal?: AbortSignal) {
    const { id: containerId } = await this.call<{ id: string }>(`/${userId}/threads`, token, { method: "POST", params });
    for (let i = 0; i < 40; i++) {
      const st = await this.call<{ status?: string; error_message?: string }>(`/${containerId}?fields=status,error_message`, token);
      if (st.status === "FINISHED") break;
      if (st.status === "ERROR" || st.status === "EXPIRED") throw new PlatformError("media", `Threads couldn't process the post: ${st.error_message ?? st.status}`);
      if (st.status === "PUBLISHED") throw new PlatformError("ambiguous", "This Threads container was already published.");
      await sleep(params.media_type === "TEXT" ? 1500 : 8000, signal);
    }
    const { id } = await this.call<{ id: string }>(`/${userId}/threads_publish`, token, { method: "POST", params: { creation_id: containerId } }, { ambiguous: true });
    const p = await this.call<{ permalink?: string }>(`/${id}?fields=permalink`, token).catch(() => ({ permalink: undefined }));
    return { id, url: p.permalink ?? null };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const m = input.media[0];
    const params: Record<string, string> = { text: input.text };
    if (!m) params.media_type = "TEXT";
    else if (m.kind === "image") Object.assign(params, { media_type: "IMAGE", image_url: await m.publicUrl(3600) });
    else Object.assign(params, { media_type: "VIDEO", video_url: await m.publicUrl(6 * 3600) });
    const r = await this.createAndPublish(input.account.externalAccountId, input.accessToken, params, input.signal);
    return { externalPostId: r.id, url: r.url };
  }

  private toItem(p: ThreadsPost, kind: EngagementInput["kind"], ownUsername: string | null | undefined, postId?: string): EngagementInput {
    return {
      externalId: p.id,
      kind,
      postExternalId: postId ?? null,
      parentExternalId: p.replied_to?.id ?? null,
      authorName: p.username ?? null,
      authorHandle: p.username ?? null,
      text: p.text ?? "",
      permalink: p.permalink ?? null,
      occurredAt: toDate(p.timestamp),
      isOwn: Boolean(ownUsername && p.username === ownUsername),
    };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }) {
    const r = await this.call<{ data?: ThreadsPost[] }>(`/${postExternalId}/conversation?fields=id,text,username,permalink,timestamp,replied_to&reverse=false`, accessToken);
    return (r.data ?? []).map((p) => this.toItem(p, p.replied_to?.id === postExternalId ? "comment" : "reply", account.username, postExternalId));
  }

  async fetchMentions({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }) {
    const r = await this.call<{ data?: ThreadsPost[] }>(`/${account.externalAccountId}/mentions?fields=id,text,username,permalink,timestamp`, accessToken);
    return (r.data ?? []).map((p) => this.toItem(p, "mention", account.username));
  }

  async reply({ accessToken, account, target, text }: ReplyInput) {
    const r = await this.createAndPublish(account.externalAccountId, accessToken, { media_type: "TEXT", text, reply_to_id: target.externalId });
    return { externalId: r.id, url: r.url };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const r = await this.call<{ data?: ThreadsPost[] }>(`/${account.externalAccountId}/threads?fields=id,text,permalink,timestamp,media_url,thumbnail_url&limit=${Math.min(limit, 50)}`, accessToken);
    return (r.data ?? []).map((p) => ({ externalPostId: p.id, url: p.permalink ?? null, text: p.text ?? null, thumbnailUrl: p.thumbnail_url ?? p.media_url ?? null, publishedAt: toDate(p.timestamp) }));
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const names = ["views", "likes", "replies", "reposts", "quotes", "shares"];
    try {
      const r = await this.call<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${externalPostId}/insights?metric=${names.join(",")}`, accessToken);
      return names.map((metric) => {
        const d = r.data?.find((x) => x.name === metric);
        const v = d?.total_value?.value ?? d?.values?.[0]?.value;
        return typeof v === "number" ? { metric, value: v, availability: "available" as const } : { metric, value: null, availability: "unsupported" as const };
      });
    } catch (err) {
      if (err instanceof PlatformError && err.kind === "permission") return names.map((metric) => ({ metric, value: null, availability: "permission_missing" as const }));
      throw err;
    }
  }

  async fetchAccountStats({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const r = await this.call<{ data?: { name: string; total_value?: { value: number } }[] }>(`/${account.externalAccountId}/threads_insights?metric=followers_count`, accessToken).catch(() => ({ data: [] }));
    return { followers: r.data?.find((d) => d.name === "followers_count")?.total_value?.value ?? null };
  }
}
