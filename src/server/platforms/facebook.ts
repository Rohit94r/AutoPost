import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, toDate } from "./base";
import { errorFromStatus, expiresAtFrom, platformFetch, readJson } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type ReplyInput, type TokenSet } from "./types";

/**
 * Facebook Pages via Facebook Login + Graph API. Each Page becomes its own connected account
 * with its own Page access token (non-expiring when derived from a long-lived user token).
 * Docs: developers.facebook.com/docs/pages-api
 */
interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; fbtrace_id?: string };
}

export class FacebookAdapter extends BaseAdapter {
  readonly platform = "facebook" as const;

  private get cfg() {
    const e = env();
    return { id: e.FACEBOOK_APP_ID, secret: e.FACEBOOK_APP_SECRET, v: e.FACEBOOK_GRAPH_VERSION };
  }
  private get graph() {
    return `https://graph.facebook.com/${this.cfg.v}`;
  }

  override isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }
  override requestedScopes() {
    return ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_read_user_content", "pages_manage_engagement", "publish_video"];
  }
  override requiredPublishScopes() {
    return ["pages_manage_posts"];
  }

  private async fail(res: Response): Promise<never> {
    const e = ((await readJson(res)) as GraphError).error;
    const msg = e?.error_user_msg || e?.message || "";
    if (e?.code === 190 || res.status === 401) throw new PlatformError("auth", "Facebook access expired or was revoked. Reconnect your Pages.", { status: res.status, requestId: e?.fbtrace_id });
    if (e?.code === 10 || (e?.code !== undefined && e.code >= 200 && e.code <= 299)) throw new PlatformError("permission", `Facebook permission missing: ${msg}`, { status: res.status });
    if (e?.code === 4 || e?.code === 17 || e?.code === 32 || e?.code === 368 || e?.code === 613) throw new PlatformError("rate_limit", `Facebook: ${msg || "rate limited"}`, { retryAfterSec: 900 });
    throw errorFromStatus(res.status, msg ? `Facebook: ${msg}` : "", res, e?.fbtrace_id);
  }

  private async get<T>(path: string, token: string): Promise<T> {
    const sep = path.includes("?") ? "&" : "?";
    const res = await platformFetch(`${this.graph}${path}${sep}access_token=${encodeURIComponent(token)}`, {});
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  private async post<T>(url: string, token: string, params: Record<string, string>, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const res = await platformFetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, access_token: token }) }, { timeoutMs: 120_000, ...opts });
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(`https://www.facebook.com/${this.cfg.v}/dialog/oauth`);
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.requestedScopes().join(","));
    return u.toString();
  }

  override async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<TokenSet> {
    const q = new URLSearchParams({ client_id: this.cfg.id!, client_secret: this.cfg.secret!, redirect_uri: redirectUri, code });
    const res = await platformFetch(`${this.graph}/oauth/access_token?${q}`, {});
    if (!res.ok) await this.fail(res);
    const short = (await readJson(res)) as { access_token?: string };
    if (!short.access_token) throw new PlatformError("auth", "Facebook did not return an access token.");
    // Exchange for a long-lived user token so derived Page tokens don't expire.
    const lq = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: this.cfg.id!, client_secret: this.cfg.secret!, fb_exchange_token: short.access_token });
    const lres = await platformFetch(`${this.graph}/oauth/access_token?${lq}`, {});
    if (!lres.ok) await this.fail(lres);
    const long = (await readJson(lres)) as { access_token?: string; expires_in?: number };
    const token = long.access_token ?? short.access_token;
    const perms = await this.get<{ data?: { permission: string; status: string }[] }>("/me/permissions", token).catch(() => ({ data: [] }));
    return { accessToken: token, refreshToken: null, expiresAt: expiresAtFrom(long.expires_in), scopes: (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission) };
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const pages = await this.get<{ data?: { id: string; name: string; access_token: string; tasks?: string[]; picture?: { data?: { url?: string } }; username?: string }[] }>(
      "/me/accounts?fields=id,name,access_token,tasks,username,picture{url}&limit=100",
      tokens.accessToken,
    );
    if (!pages.data?.length) throw new PlatformError("permission", "No Facebook Pages were shared. Select at least one Page you manage during sign-in.");
    return pages.data.map((p) => {
      const canPost = !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE");
      return {
        externalId: p.id,
        displayName: p.name,
        username: p.username ?? null,
        avatarUrl: p.picture?.data?.url ?? null,
        accountType: "page",
        eligible: canPost,
        eligibilityReason: canPost ? undefined : "You need the 'Create content' task on this Page.",
        // Stored encrypted as this account's token by storeConnectedAccounts, then removed from metadata.
        metadata: { pageAccessToken: p.access_token, tasks: p.tasks ?? [] },
      };
    });
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const pageId = input.account.externalAccountId;
    const m = input.media[0];
    let id: string;
    if (!m) {
      const r = await this.post<{ id: string }>(`${this.graph}/${pageId}/feed`, input.accessToken, { message: input.text, ...(input.linkUrl ? { link: input.linkUrl } : {}) }, { ambiguous: true });
      id = r.id;
    } else if (m.kind === "image") {
      const r = await this.post<{ id: string; post_id?: string }>(`${this.graph}/${pageId}/photos`, input.accessToken, { url: await m.publicUrl(3600), caption: input.text }, { ambiguous: true });
      id = r.post_id ?? r.id;
    } else {
      const r = await this.post<{ id: string }>(
        `https://graph-video.facebook.com/${this.cfg.v}/${pageId}/videos`,
        input.accessToken,
        { file_url: await m.publicUrl(6 * 3600), description: input.text, ...(input.title ? { title: input.title.slice(0, 250) } : {}) },
        { ambiguous: true },
      );
      id = r.id;
    }
    let url: string | null = null;
    try {
      url = (await this.get<{ permalink_url?: string }>(`/${id}?fields=permalink_url`, input.accessToken)).permalink_url ?? null;
    } catch {
      /* optional */
    }
    return { externalPostId: id, url };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }): Promise<EngagementInput[]> {
    const r = await this.get<{ data?: { id: string; message?: string; created_time: string; from?: { id: string; name: string }; permalink_url?: string; parent?: { id: string } }[] }>(
      `/${postExternalId}/comments?fields=id,message,created_time,from,permalink_url,parent{id}&filter=stream&order=reverse_chronological&limit=100`,
      accessToken,
    );
    return (r.data ?? []).map((c) => ({
      externalId: c.id,
      kind: c.parent ? "reply" : "comment",
      postExternalId,
      parentExternalId: c.parent?.id ?? postExternalId,
      authorName: c.from?.name ?? null,
      authorExternalId: c.from?.id ?? null,
      text: c.message ?? "",
      permalink: c.permalink_url ?? null,
      occurredAt: toDate(c.created_time),
      isOwn: c.from?.id === account.externalAccountId,
    }));
  }

  async reply({ accessToken, target, text }: ReplyInput) {
    const r = await this.post<{ id: string }>(`${this.graph}/${target.externalId}/comments`, accessToken, { message: text });
    return { externalId: r.id };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const r = await this.get<{ data?: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string }[] }>(
      `/${account.externalAccountId}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=${Math.min(limit, 50)}`,
      accessToken,
    );
    return (r.data ?? []).map((p) => ({ externalPostId: p.id, url: p.permalink_url ?? null, text: p.message ?? null, thumbnailUrl: p.full_picture ?? null, publishedAt: toDate(p.created_time) }));
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const p = await this.get<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(
      `/${externalPostId}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares`,
      accessToken,
    );
    const out: MetricValue[] = [
      { metric: "reactions", value: p.reactions?.summary?.total_count ?? null, availability: "available" },
      { metric: "comments", value: p.comments?.summary?.total_count ?? null, availability: "available" },
      { metric: "shares", value: p.shares?.count ?? 0, availability: "available" },
    ];
    try {
      // post_impressions was removed in Nov 2025; post_media_view is its replacement.
      const ins = await this.get<{ data?: { name: string; values?: { value: number }[] }[] }>(`/${externalPostId}/insights?metric=post_media_view`, accessToken);
      const v = ins.data?.[0]?.values?.[0]?.value;
      out.push({ metric: "views", value: typeof v === "number" ? v : null, availability: typeof v === "number" ? "available" : "unavailable" });
    } catch {
      out.push({ metric: "views", value: null, availability: "permission_missing", note: "Needs read_insights / pages_read_engagement." });
    }
    return out;
  }

  async fetchAccountStats({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const p = await this.get<{ followers_count?: number; fan_count?: number }>(`/${account.externalAccountId}?fields=followers_count,fan_count`, accessToken);
    return { followers: p.followers_count ?? null, likes: p.fan_count ?? null };
  }
}
