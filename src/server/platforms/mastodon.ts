import "server-only";
import { baseUrl, BaseAdapter, meta, toDate } from "./base";
import { bearer, failGeneric, platformFetch, readJson, sleep } from "./http";
import { PlatformError, type AccountStats, type CredentialField, type EngagementInput, type MetricValue, type PublishInput, type PublishResult, type RemotePost, type ReplyInput } from "./types";

/**
 * Mastodon (any instance) — REST API with a personal access token (Preferences → Development,
 * scopes read + write). Docs: docs.joinmastodon.org/methods/statuses
 */
interface Status {
  id: string;
  url: string | null;
  uri: string;
  content: string;
  created_at: string;
  in_reply_to_id: string | null;
  account: { id: string; acct: string; display_name: string; avatar: string; username: string };
  favourites_count?: number;
  reblogs_count?: number;
  replies_count?: number;
  media_attachments?: { preview_url?: string }[];
}

export const stripHtml = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export class MastodonAdapter extends BaseAdapter {
  readonly platform = "mastodon" as const;

  credentialFields(): CredentialField[] {
    return [
      { key: "instanceUrl", label: "Instance URL", type: "url", placeholder: "https://mastodon.social", required: true },
      { key: "accessToken", label: "Access token", type: "password", help: "Preferences → Development → New application (scopes: read, write) → copy 'Your access token'.", required: true },
    ];
  }

  private instance(account: PublishInput["account"]) {
    const u = meta(account, "instanceUrl");
    if (!u) throw new PlatformError("validation", "Mastodon instance URL is missing. Reconnect the account.");
    return baseUrl(u);
  }

  private async call(url: string, token: string, init: RequestInit = {}, opts: { ambiguous?: boolean } = {}) {
    const res = await platformFetch(url, { ...init, headers: { ...bearer(token), ...(init.headers ?? {}) } }, { userHost: true, ...opts });
    if (!res.ok) await failGeneric(res, "Mastodon");
    return readJson(res);
  }

  async connectWithCredentials(values: Record<string, string>) {
    const instanceUrl = baseUrl(values.instanceUrl ?? "");
    const token = (values.accessToken ?? "").trim();
    if (!instanceUrl || !token) throw new PlatformError("validation", "Instance URL and access token are required.");
    const me = (await this.call(`${instanceUrl}/api/v1/accounts/verify_credentials`, token)) as { id: string; username: string; acct: string; display_name: string; avatar: string };
    let maxChars = 500;
    try {
      const inst = (await this.call(`${instanceUrl}/api/v2/instance`, token)) as { configuration?: { statuses?: { max_characters?: number } } };
      maxChars = inst.configuration?.statuses?.max_characters ?? 500;
    } catch {
      /* older instances */
    }
    const host = new URL(instanceUrl).host;
    return {
      tokens: { accessToken: token, refreshToken: null, expiresAt: null, scopes: ["read", "write"] },
      profiles: [
        {
          externalId: `${me.id}@${host}`,
          displayName: me.display_name || me.username,
          username: `${me.username}@${host}`,
          avatarUrl: me.avatar,
          accountType: "user",
          eligible: true,
          metadata: { instanceUrl, accountId: me.id, maxChars },
        },
      ],
    };
  }

  private async uploadMedia(base: string, token: string, m: PublishInput["media"][number], signal?: AbortSignal) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await m.load())], { type: m.mimeType }), m.kind === "video" ? "video" : "image");
    if (m.altText) form.append("description", m.altText.slice(0, 1500));
    const res = await platformFetch(`${base}/api/v2/media`, { method: "POST", headers: bearer(token), body: form, signal }, { userHost: true, timeoutMs: 300_000 });
    if (!res.ok) await failGeneric(res, "Mastodon media");
    let media = (await readJson(res)) as { id: string; url: string | null };
    for (let i = 0; !media.url && i < 60; i++) {
      await sleep(3000, signal);
      media = (await this.call(`${base}/api/v1/media/${media.id}`, token)) as { id: string; url: string | null };
    }
    return media.id;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const base = this.instance(input.account);
    const mediaIds: string[] = [];
    for (const m of input.media) mediaIds.push(await this.uploadMedia(base, input.accessToken, m, input.signal));
    const status = (await this.call(
      `${base}/api/v1/statuses`,
      input.accessToken,
      {
        method: "POST",
        // Mastodon de-duplicates requests with the same Idempotency-Key for an hour.
        headers: { "Content-Type": "application/json", ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
        body: JSON.stringify({ status: input.text, media_ids: mediaIds, visibility: "public" }),
      },
      { ambiguous: true },
    )) as Status;
    return { externalPostId: status.id, url: status.url ?? status.uri };
  }

  private toItem(s: Status, kind: EngagementInput["kind"], ownId: string | undefined, postId?: string): EngagementInput {
    return {
      externalId: s.id,
      kind,
      postExternalId: postId ?? null,
      parentExternalId: s.in_reply_to_id,
      authorName: s.account.display_name || s.account.username,
      authorHandle: s.account.acct,
      authorExternalId: s.account.id,
      authorAvatarUrl: s.account.avatar,
      text: stripHtml(s.content),
      permalink: s.url,
      occurredAt: toDate(s.created_at),
      replyTarget: { acct: s.account.acct },
      isOwn: s.account.id === ownId,
    };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }) {
    const ctx = (await this.call(`${this.instance(account)}/api/v1/statuses/${postExternalId}/context`, accessToken)) as { descendants: Status[] };
    const own = meta(account, "accountId");
    return ctx.descendants.map((s) => this.toItem(s, s.in_reply_to_id === postExternalId ? "comment" : "reply", own, postExternalId));
  }

  async fetchMentions({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }) {
    const list = (await this.call(`${this.instance(account)}/api/v1/notifications?types[]=mention&limit=40`, accessToken)) as { type: string; status?: Status }[];
    const own = meta(account, "accountId");
    return list.filter((n) => n.status).map((n) => this.toItem(n.status!, "mention", own));
  }

  async reply({ accessToken, account, target, text }: ReplyInput) {
    const acct = target.replyTarget.acct;
    const body = acct && !text.includes(`@${acct}`) ? `@${acct} ${text}` : text;
    const s = (await this.call(`${this.instance(account)}/api/v1/statuses`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: body, in_reply_to_id: target.externalId, visibility: "public" }),
    })) as Status;
    return { externalId: s.id, url: s.url };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const id = meta(account, "accountId");
    if (!id) return [];
    const list = (await this.call(`${this.instance(account)}/api/v1/accounts/${id}/statuses?limit=${Math.min(limit, 40)}&exclude_replies=true&exclude_reblogs=true`, accessToken)) as Status[];
    return list.map((s) => ({ externalPostId: s.id, url: s.url, text: stripHtml(s.content), thumbnailUrl: s.media_attachments?.[0]?.preview_url ?? null, publishedAt: toDate(s.created_at) }));
  }

  override async fetchMetrics({ accessToken, externalPostId, account }: { accessToken: string; externalPostId: string; account: PublishInput["account"] }): Promise<MetricValue[]> {
    const s = (await this.call(`${this.instance(account)}/api/v1/statuses/${externalPostId}`, accessToken)) as Status;
    return [
      { metric: "likes", value: s.favourites_count ?? null, availability: "available" },
      { metric: "reposts", value: s.reblogs_count ?? null, availability: "available" },
      { metric: "replies", value: s.replies_count ?? null, availability: "available" },
    ];
  }

  async fetchAccountStats({ accessToken, account }: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats> {
    const me = (await this.call(`${this.instance(account)}/api/v1/accounts/verify_credentials`, accessToken)) as { followers_count: number; following_count: number; statuses_count: number };
    return { followers: me.followers_count, following: me.following_count, posts: me.statuses_count };
  }
}
