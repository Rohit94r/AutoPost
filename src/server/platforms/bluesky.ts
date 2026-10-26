import "server-only";
import { baseUrl, BaseAdapter, meta, toDate } from "./base";
import { assertAllowedUrl, bearer, platformFetch, readJson } from "./http";
import { PlatformError, type AccountStats, type CredentialField, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type ReplyInput, type TokenSet } from "./types";

/**
 * Bluesky (AT Protocol). Connect with handle + App Password (never the main password).
 * Docs: docs.bsky.app/docs/advanced-guides/posts
 */
const DEFAULT_PDS = "https://bsky.social";
const encoder = new TextEncoder();

interface PostView {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string; avatar?: string };
  record: { text?: string; createdAt?: string; reply?: { root: { uri: string; cid: string }; parent: { uri: string; cid: string } } };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  embed?: { images?: { thumb?: string }[] };
  indexedAt?: string;
}
interface ThreadNode {
  post?: PostView;
  replies?: ThreadNode[];
}

/** Rich-text facets for links and hashtags (offsets are UTF-8 byte positions). */
export function buildFacets(text: string) {
  const facets: unknown[] = [];
  const byteIndex = (charIndex: number) => encoder.encode(text.slice(0, charIndex)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const start = m.index ?? 0;
    const uri = m[0].replace(/[.,;:!?]+$/, "");
    facets.push({ index: { byteStart: byteIndex(start), byteEnd: byteIndex(start + uri.length) }, features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    const start = (m.index ?? 0) + m[1]!.length;
    facets.push({ index: { byteStart: byteIndex(start), byteEnd: byteIndex(start + 1 + m[2]!.length) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  return facets;
}

const jwtExpiry = (jwt: string) => {
  try {
    const p = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as { exp?: number };
    return p.exp ? new Date(p.exp * 1000) : null;
  } catch {
    return null;
  }
};

export const rkeyOf = (uri: string) => uri.split("/").pop() ?? "";

export class BlueskyAdapter extends BaseAdapter {
  readonly platform = "bluesky" as const;

  credentialFields(): CredentialField[] {
    return [
      { key: "handle", label: "Handle or email", type: "text", placeholder: "yourname.bsky.social", required: true },
      { key: "appPassword", label: "App password", type: "password", help: "Settings → Privacy and security → App passwords. Never use your main password.", required: true },
      { key: "pds", label: "Hosting provider (optional)", type: "url", placeholder: DEFAULT_PDS, help: "Only change this if you self-host your Bluesky account." },
    ];
  }

  /** Bluesky-hosted accounts use the allow-list; self-hosted PDS hosts are validated as public. */
  private isUserHost(pds: string) {
    try {
      assertAllowedUrl(pds);
      return false;
    } catch {
      return true;
    }
  }

  private async xrpc<T>(pds: string, method: string, token: string | null, init: { query?: Record<string, string>; body?: unknown; raw?: { data: Uint8Array; type: string } } = {}, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const url = new URL(`${baseUrl(pds)}/xrpc/${method}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const isPost = init.body !== undefined || init.raw !== undefined;
    const res = await platformFetch(
      url.toString(),
      {
        method: isPost ? "POST" : "GET",
        headers: { ...(token ? bearer(token) : {}), ...(init.raw ? { "Content-Type": init.raw.type } : isPost ? { "Content-Type": "application/json" } : {}) },
        body: init.raw ? (init.raw.data as unknown as BodyInit) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
      },
      { userHost: this.isUserHost(pds), timeoutMs: 60_000, ...opts },
    );
    const data = (await readJson(res)) as T & { error?: string; message?: string };
    if (!res.ok) {
      const msg = `Bluesky: ${data.message ?? data.error ?? res.status}`;
      if (res.status === 401 || data.error === "ExpiredToken" || data.error === "InvalidToken" || data.error === "AuthenticationRequired") throw new PlatformError("auth", msg);
      if (res.status === 429) throw new PlatformError("rate_limit", msg, { retryAfterSec: 300 });
      if (res.status >= 500) throw new PlatformError("transient", msg);
      throw new PlatformError("validation", msg);
    }
    return data;
  }

  private tokensFrom(pds: string, s: { accessJwt: string; refreshJwt: string }): TokenSet {
    // The PDS host travels with the refresh token so refresh() is self-contained.
    return { accessToken: s.accessJwt, refreshToken: `${baseUrl(pds)}|${s.refreshJwt}`, expiresAt: jwtExpiry(s.accessJwt), scopes: [] };
  }

  async connectWithCredentials(values: Record<string, string>) {
    const pds = baseUrl(values.pds?.trim() || DEFAULT_PDS);
    const identifier = (values.handle ?? "").trim().replace(/^@/, "");
    const password = (values.appPassword ?? "").trim();
    if (!identifier || !password) throw new PlatformError("validation", "Handle and app password are required.");
    const s = await this.xrpc<{ did: string; handle: string; accessJwt: string; refreshJwt: string }>(pds, "com.atproto.server.createSession", null, { body: { identifier, password } });
    const profile = await this.xrpc<{ displayName?: string; avatar?: string }>(pds, "app.bsky.actor.getProfile", s.accessJwt, { query: { actor: s.did } }).catch(() => ({}) as { displayName?: string; avatar?: string });
    return {
      tokens: this.tokensFrom(pds, s),
      profiles: [{ externalId: s.did, displayName: profile.displayName || s.handle, username: s.handle, avatarUrl: profile.avatar ?? null, accountType: "user", eligible: true, metadata: { pds, handle: s.handle } }],
    };
  }

  override canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken?.includes("|"));
  }

  override async refresh({ refreshToken }: { refreshToken?: string | null }): Promise<TokenSet> {
    const [pds, jwt] = (refreshToken ?? "").split("|");
    if (!pds || !jwt) throw new PlatformError("auth", "Bluesky session can't be refreshed. Reconnect with an app password.");
    const s = await this.xrpc<{ accessJwt: string; refreshJwt: string }>(pds, "com.atproto.server.refreshSession", jwt, { body: {} });
    return this.tokensFrom(pds, s);
  }

  private pds(account: PublishInput["account"]) {
    return meta(account, "pds") ?? DEFAULT_PDS;
  }

  private postUrl(account: PublishInput["account"], uri: string) {
    return `https://bsky.app/profile/${meta(account, "handle") ?? account.externalAccountId}/post/${rkeyOf(uri)}`;
  }

  private async createPost(account: PublishInput["account"], token: string, record: Record<string, unknown>, opts: { ambiguous?: boolean } = {}) {
    return this.xrpc<{ uri: string; cid: string }>(
      this.pds(account),
      "com.atproto.repo.createRecord",
      token,
      { body: { repo: account.externalAccountId, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", createdAt: new Date().toISOString(), ...record } } },
      opts,
    );
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const pds = this.pds(input.account);
    const images = [];
    for (const m of input.media.filter((x) => x.kind === "image").slice(0, 4)) {
      const data = await m.load();
      if (data.length > 1_000_000) throw new PlatformError("media", "Bluesky images must be under 1 MB.");
      const { blob } = await this.xrpc<{ blob: unknown }>(pds, "com.atproto.repo.uploadBlob", input.accessToken, { raw: { data: new Uint8Array(data), type: m.mimeType } });
      images.push({ alt: m.altText ?? "", image: blob, ...(m.width && m.height ? { aspectRatio: { width: m.width, height: m.height } } : {}) });
    }
    const facets = buildFacets(input.text);
    const res = await this.createPost(
      input.account,
      input.accessToken,
      { text: input.text, ...(facets.length ? { facets } : {}), ...(images.length ? { embed: { $type: "app.bsky.embed.images", images } } : {}) },
      { ambiguous: true },
    );
    return { externalPostId: res.uri, url: this.postUrl(input.account, res.uri) };
  }

  private toItem(p: PostView, kind: EngagementInput["kind"], ownDid: string, root: { uri: string; cid: string }, postUri?: string): EngagementInput {
    return {
      externalId: p.uri,
      kind,
      postExternalId: postUri ?? root.uri,
      parentExternalId: p.record.reply?.parent.uri ?? null,
      authorName: p.author.displayName || p.author.handle,
      authorHandle: p.author.handle,
      authorExternalId: p.author.did,
      authorAvatarUrl: p.author.avatar ?? null,
      text: p.record.text ?? "",
      permalink: `https://bsky.app/profile/${p.author.handle}/post/${rkeyOf(p.uri)}`,
      occurredAt: toDate(p.record.createdAt ?? p.indexedAt),
      replyTarget: { rootUri: root.uri, rootCid: root.cid, parentUri: p.uri, parentCid: p.cid },
      isOwn: p.author.did === ownDid,
    };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }) {
    const { thread } = await this.xrpc<{ thread: ThreadNode }>(this.pds(account), "app.bsky.feed.getPostThread", accessToken, { query: { uri: postExternalId, depth: "6" } });
    const root = thread.post ? { uri: thread.post.uri, cid: thread.post.cid } : { uri: postExternalId, cid: "" };
    const out: EngagementInput[] = [];
    const walk = (nodes: ThreadNode[] | undefined, depth: number) => {
      for (const n of nodes ?? []) {
        if (!n.post) continue;
        out.push(this.toItem(n.post, depth === 0 ? "comment" : "reply", account.externalAccountId, root, postExternalId));
        walk(n.replies, depth + 1);
      }
    };
    walk(thread.replies, 0);
    return out;
  }

  async fetchMentions({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }) {
    const { notifications } = await this.xrpc<{ notifications: (PostView & { reason: string })[] }>(this.pds(account), "app.bsky.notification.listNotifications", accessToken, { query: { limit: "50" } });
    return notifications
      .filter((n) => n.reason === "mention")
      .map((n) => this.toItem(n, "mention", account.externalAccountId, n.record.reply?.root ?? { uri: n.uri, cid: n.cid }));
  }

  async reply({ accessToken, account, target, text }: ReplyInput) {
    const r = target.replyTarget;
    if (!r.parentUri || !r.parentCid || !r.rootUri || !r.rootCid) throw new PlatformError("validation", "Missing Bluesky thread references for this reply.");
    const facets = buildFacets(text);
    const res = await this.createPost(account, accessToken, {
      text,
      ...(facets.length ? { facets } : {}),
      reply: { root: { uri: r.rootUri, cid: r.rootCid }, parent: { uri: r.parentUri, cid: r.parentCid } },
    });
    return { externalId: res.uri, url: this.postUrl(account, res.uri) };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const { feed } = await this.xrpc<{ feed: { post: PostView }[] }>(this.pds(account), "app.bsky.feed.getAuthorFeed", accessToken, {
      query: { actor: account.externalAccountId, limit: String(Math.min(limit, 50)), filter: "posts_no_replies" },
    });
    return feed
      .filter((f) => f.post.author.did === account.externalAccountId)
      .map((f) => ({ externalPostId: f.post.uri, url: this.postUrl(account, f.post.uri), text: f.post.record.text ?? "", thumbnailUrl: f.post.embed?.images?.[0]?.thumb ?? null, publishedAt: toDate(f.post.record.createdAt) }));
  }

  override async fetchMetrics({ accessToken, externalPostId, account }: { accessToken: string; externalPostId: string; account: PublishInput["account"] }): Promise<MetricValue[]> {
    const { posts } = await this.xrpc<{ posts: PostView[] }>(this.pds(account), "app.bsky.feed.getPosts", accessToken, { query: { uris: externalPostId } });
    const p = posts[0];
    if (!p) return [];
    return [
      { metric: "likes", value: p.likeCount ?? null, availability: "available" },
      { metric: "reposts", value: p.repostCount ?? null, availability: "available" },
      { metric: "replies", value: p.replyCount ?? null, availability: "available" },
      { metric: "quotes", value: p.quoteCount ?? null, availability: "available" },
    ];
  }

  async fetchAccountStats({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const p = await this.xrpc<{ followersCount?: number; followsCount?: number; postsCount?: number }>(this.pds(account), "app.bsky.actor.getProfile", accessToken, { query: { actor: account.externalAccountId } });
    return { followers: p.followersCount ?? null, following: p.followsCount ?? null, posts: p.postsCount ?? null };
  }
}
