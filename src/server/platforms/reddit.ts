import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, meta, toDate } from "./base";
import { bearer, errorFromStatus, expiresAtFrom, platformFetch, readJson, retryAfterFrom } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type ReplyInput, type TokenSet } from "./types";

/**
 * Reddit API. New apps need Reddit's approval under the Responsible Builder Policy; commercial
 * use requires a separate agreement. Posts go to the user's profile (u_<name>) unless a default
 * subreddit is chosen in the account settings.
 */
const OAUTH = "https://oauth.reddit.com";

interface Thing<T> {
  kind: string;
  data: T;
}
interface CommentData {
  id: string;
  name: string;
  author: string;
  body?: string;
  created_utc: number;
  permalink?: string;
  parent_id: string;
  link_id?: string;
  replies?: { data?: { children?: Thing<CommentData>[] } } | "";
}

export class RedditAdapter extends BaseAdapter {
  readonly platform = "reddit" as const;

  private get cfg() {
    const e = env();
    return { id: e.REDDIT_CLIENT_ID, secret: e.REDDIT_CLIENT_SECRET, ua: `web:flowt:${process.env.npm_package_version ?? "1.0"} (by /u/${e.REDDIT_USERNAME ?? "flowt"})` };
  }
  override isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }
  override requestedScopes() {
    return ["identity", "submit", "read", "privatemessages", "history"];
  }
  override requiredPublishScopes() {
    return ["submit", "identity"];
  }

  private async fail(res: Response): Promise<never> {
    const b = (await readJson(res)) as { message?: string; error?: string | number; reason?: string };
    if (res.status === 401) throw new PlatformError("auth", "Reddit access expired. Reconnect the account.");
    if (res.status === 429) throw new PlatformError("rate_limit", "Reddit rate limit reached.", { retryAfterSec: retryAfterFrom(res, 60) });
    throw errorFromStatus(res.status, `Reddit: ${b.message ?? b.reason ?? b.error ?? res.status}`, res);
  }

  private async call<T>(path: string, token: string, form?: Record<string, string>, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const res = await platformFetch(
      `${OAUTH}${path}`,
      form
        ? { method: "POST", headers: { ...bearer(token), "User-Agent": this.cfg.ua, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) }
        : { headers: { ...bearer(token), "User-Agent": this.cfg.ua } },
      opts,
    );
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL("https://www.reddit.com/api/v1/authorize");
    for (const [k, v] of Object.entries({ client_id: this.cfg.id!, response_type: "code", state, redirect_uri: redirectUri, duration: "permanent", scope: this.requestedScopes().join(" ") })) u.searchParams.set(k, v);
    return u.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await platformFetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.cfg.id}:${this.cfg.secret}`).toString("base64")}`, "User-Agent": this.cfg.ua, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const b = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
    if (!res.ok || !b.access_token) throw new PlatformError("auth", `Reddit sign-in failed: ${b.error ?? res.status}`);
    return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: expiresAtFrom(b.expires_in), scopes: (b.scope ?? "").split(/[ ,]+/).filter(Boolean) };
  }

  override exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }) {
    return this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  }
  override canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }
  override async refresh({ refreshToken }: { refreshToken?: string | null }) {
    if (!refreshToken) throw new PlatformError("auth", "No Reddit refresh token. Reconnect.");
    const t = await this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  }
  override async revoke({ refreshToken, accessToken }: { accessToken: string; refreshToken?: string | null }) {
    const res = await platformFetch("https://www.reddit.com/api/v1/revoke_token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.cfg.id}:${this.cfg.secret}`).toString("base64")}`, "User-Agent": this.cfg.ua, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken ?? accessToken, token_type_hint: refreshToken ? "refresh_token" : "access_token" }),
    }).catch(() => null);
    return { revoked: Boolean(res?.ok) };
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const me = await this.call<{ id: string; name: string; icon_img?: string; link_karma?: number; comment_karma?: number }>("/api/v1/me", tokens.accessToken);
    return [{ externalId: me.id, displayName: `u/${me.name}`, username: me.name, avatarUrl: me.icon_img?.split("?")[0] ?? null, accountType: "user", eligible: true }];
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const sr = meta(input.account, "subreddit") ?? `u_${input.account.username}`;
    const title = (input.title?.trim() || input.text.split("\n")[0] || "").slice(0, 300);
    const form: Record<string, string> = { sr, title, api_type: "json", resubmit: "true", sendreplies: "true" };
    if (input.linkUrl && !input.text.trim()) Object.assign(form, { kind: "link", url: input.linkUrl });
    else Object.assign(form, { kind: "self", text: input.text });
    const r = await this.call<{ json?: { errors?: [string, string, string][]; data?: { id?: string; name?: string; url?: string } } }>("/api/submit", input.accessToken, form, { ambiguous: true });
    const errs = r.json?.errors ?? [];
    if (errs.length) {
      const [code, message] = errs[0]!;
      if (code === "RATELIMIT") throw new PlatformError("rate_limit", `Reddit: ${message}`, { retryAfterSec: 600 });
      if (code === "SUBREDDIT_NOEXIST" || code === "SUBREDDIT_NOTALLOWED" || code === "NO_SELFS" || code === "NO_LINKS") throw new PlatformError("validation", `Reddit: ${message}`);
      throw new PlatformError("validation", `Reddit: ${message}`);
    }
    const id = r.json?.data?.name ?? (r.json?.data?.id ? `t3_${r.json.data.id}` : null);
    if (!id) throw new PlatformError("ambiguous", "Reddit didn't return a post id. Check your profile before retrying.");
    return { externalPostId: id, url: r.json?.data?.url ?? null };
  }

  private flatten(children: Thing<CommentData>[] | undefined, postId: string, own: string | null | undefined, out: EngagementInput[], depth = 0) {
    for (const c of children ?? []) {
      if (c.kind !== "t1" || !c.data.body) continue;
      out.push({
        externalId: c.data.name,
        kind: depth === 0 ? "comment" : "reply",
        postExternalId: postId,
        parentExternalId: c.data.parent_id,
        authorName: c.data.author,
        authorHandle: c.data.author,
        text: c.data.body,
        permalink: c.data.permalink ? `https://www.reddit.com${c.data.permalink}` : null,
        occurredAt: toDate(c.data.created_utc),
        isOwn: Boolean(own && c.data.author === own),
      });
      if (c.data.replies && typeof c.data.replies === "object") this.flatten(c.data.replies.data?.children, postId, own, out, depth + 1);
    }
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }) {
    const r = await this.call<[unknown, { data?: { children?: Thing<CommentData>[] } }]>(`/comments/${postExternalId.replace(/^t3_/, "")}.json?limit=200&depth=5&sort=new`, accessToken);
    const out: EngagementInput[] = [];
    this.flatten(r[1]?.data?.children, postExternalId, account.username, out);
    return out;
  }

  async fetchMentions({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }) {
    const r = await this.call<{ data?: { children?: Thing<CommentData & { context?: string; subject?: string }>[] } }>("/message/mentions?limit=50", accessToken);
    return (r.data?.children ?? []).map((c) => ({
      externalId: c.data.name,
      kind: "mention" as const,
      postExternalId: c.data.link_id ?? null,
      parentExternalId: c.data.parent_id,
      authorName: c.data.author,
      authorHandle: c.data.author,
      text: c.data.body ?? "",
      permalink: c.data.context ? `https://www.reddit.com${c.data.context}` : null,
      occurredAt: toDate(c.data.created_utc),
      isOwn: c.data.author === account.username,
    }));
  }

  async reply({ accessToken, target, text }: ReplyInput) {
    const r = await this.call<{ json?: { errors?: [string, string][]; data?: { things?: { data: { name: string; permalink?: string } }[] } } }>("/api/comment", accessToken, { thing_id: target.externalId, text, api_type: "json" });
    if (r.json?.errors?.length) throw new PlatformError("validation", `Reddit: ${r.json.errors[0]![1]}`);
    const t = r.json?.data?.things?.[0]?.data;
    if (!t) throw new PlatformError("ambiguous", "Reddit didn't confirm the reply.");
    return { externalId: t.name, url: t.permalink ? `https://www.reddit.com${t.permalink}` : null };
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const r = await this.call<{ data?: { children?: Thing<{ score?: number; num_comments?: number; upvote_ratio?: number }>[] } }>(`/api/info?id=${externalPostId}`, accessToken);
    const d = r.data?.children?.[0]?.data;
    if (!d) return [];
    return [
      { metric: "score", value: d.score ?? null, availability: "available" },
      { metric: "comments", value: d.num_comments ?? null, availability: "available" },
    ];
  }

  async fetchAccountStats({ accessToken }: { accessToken: string }): Promise<AccountStats> {
    const me = await this.call<{ link_karma?: number; comment_karma?: number; total_karma?: number }>("/api/v1/me", accessToken);
    return { karma: me.total_karma ?? (me.link_karma ?? 0) + (me.comment_karma ?? 0) };
  }
}
