import "server-only";
import { baseUrl, BaseAdapter, meta, toDate } from "./base";
import { failGeneric, platformFetch, readJson } from "./http";
import { stripHtml } from "./mastodon";
import { PlatformError, type CredentialField, type EngagementInput, type PublishInput, type PublishResult, type RemotePost, type ReplyInput } from "./types";

/**
 * Self-hosted or WordPress.com Business sites through the core REST API, authenticated with an
 * Application Password (Users → Profile → Application Passwords). Docs: developer.wordpress.org/rest-api
 */
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text → simple paragraphs, with bare URLs linked. */
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>").replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("\n");
}

export class WordPressAdapter extends BaseAdapter {
  readonly platform = "wordpress" as const;

  credentialFields(): CredentialField[] {
    return [
      { key: "siteUrl", label: "Site URL", type: "url", placeholder: "https://yourblog.com", required: true },
      { key: "username", label: "WordPress username", type: "text", required: true },
      { key: "appPassword", label: "Application password", type: "password", help: "Users → Profile → Application Passwords → Add New. Not your login password.", required: true },
    ];
  }

  private site(account: PublishInput["account"]) {
    const s = meta(account, "siteUrl");
    if (!s) throw new PlatformError("validation", "Site URL is missing. Reconnect the site.");
    return baseUrl(s);
  }

  private async call(url: string, token: string, init: RequestInit = {}, opts: { ambiguous?: boolean; timeoutMs?: number } = {}) {
    const res = await platformFetch(url, { ...init, headers: { Authorization: `Basic ${token}`, ...(init.headers ?? {}) } }, { userHost: true, ...opts });
    if (!res.ok) await failGeneric(res, "WordPress");
    return readJson(res);
  }

  async connectWithCredentials(values: Record<string, string>) {
    const site = baseUrl(values.siteUrl ?? "");
    const user = (values.username ?? "").trim();
    const pass = (values.appPassword ?? "").replace(/\s+/g, " ").trim();
    if (!site || !user || !pass) throw new PlatformError("validation", "Site URL, username and application password are required.");
    const token = Buffer.from(`${user}:${pass}`).toString("base64");
    const me = (await this.call(`${site}/wp-json/wp/v2/users/me?context=edit`, token)) as { id: number; name: string; slug: string; avatar_urls?: Record<string, string>; capabilities?: Record<string, boolean> };
    let siteName = new URL(site).host;
    try {
      siteName = ((await this.call(`${site}/wp-json`, token)) as { name?: string }).name || siteName;
    } catch {
      /* optional */
    }
    const canPublish = me.capabilities ? Boolean(me.capabilities.publish_posts) : true;
    return {
      tokens: { accessToken: token, refreshToken: null, expiresAt: null, scopes: [] },
      profiles: [
        {
          externalId: `${new URL(site).host}:${me.id}`,
          displayName: siteName,
          username: me.slug,
          avatarUrl: me.avatar_urls?.["96"] ?? null,
          accountType: "site",
          eligible: canPublish,
          eligibilityReason: canPublish ? undefined : "This WordPress user can't publish posts.",
          metadata: { siteUrl: site, userId: me.id },
        },
      ],
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const site = this.site(input.account);
    let featured: number | undefined;
    const img = input.media.find((m) => m.kind === "image");
    if (img) {
      const media = (await this.call(
        `${site}/wp-json/wp/v2/media`,
        input.accessToken,
        { method: "POST", headers: { "Content-Type": img.mimeType, "Content-Disposition": `attachment; filename="flowt-${img.id}.${img.mimeType.split("/")[1]}"` }, body: new Uint8Array(await img.load()) },
        { timeoutMs: 120_000 },
      )) as { id: number };
      featured = media.id;
      if (img.altText) await this.call(`${site}/wp-json/wp/v2/media/${media.id}`, input.accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alt_text: img.altText }) }).catch(() => undefined);
    }
    const title = input.title?.trim() || input.text.split("\n")[0]!.slice(0, 120);
    const post = (await this.call(
      `${site}/wp-json/wp/v2/posts`,
      input.accessToken,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: textToHtml(input.text), status: "publish", ...(featured ? { featured_media: featured } : {}) }) },
      { ambiguous: true },
    )) as { id: number; link: string };
    return { externalPostId: String(post.id), url: post.link };
  }

  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }): Promise<EngagementInput[]> {
    const list = (await this.call(`${this.site(account)}/wp-json/wp/v2/comments?post=${postExternalId}&per_page=50&orderby=date&order=desc`, accessToken)) as {
      id: number;
      parent: number;
      author: number;
      author_name: string;
      author_avatar_urls?: Record<string, string>;
      content: { rendered: string };
      date_gmt: string;
      link: string;
    }[];
    const own = Number(meta(account, "userId") ?? 0);
    return list.map((c) => ({
      externalId: String(c.id),
      kind: c.parent ? "reply" : "comment",
      postExternalId,
      parentExternalId: c.parent ? String(c.parent) : postExternalId,
      authorName: c.author_name,
      authorAvatarUrl: c.author_avatar_urls?.["48"] ?? null,
      text: stripHtml(c.content.rendered),
      permalink: c.link,
      occurredAt: toDate(`${c.date_gmt}Z`),
      replyTarget: { postId: postExternalId },
      isOwn: Boolean(own && c.author === own),
    }));
  }

  async reply({ accessToken, account, target, text }: ReplyInput) {
    const c = (await this.call(`${this.site(account)}/wp-json/wp/v2/comments`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post: Number(target.replyTarget.postId ?? target.postExternalId), parent: Number(target.externalId), content: text }),
    })) as { id: number; link: string };
    return { externalId: String(c.id), url: c.link };
  }

  async fetchRecentPosts({ accessToken, account, limit }: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]> {
    const list = (await this.call(`${this.site(account)}/wp-json/wp/v2/posts?per_page=${Math.min(limit, 50)}&_fields=id,link,title,date_gmt`, accessToken)) as { id: number; link: string; title: { rendered: string }; date_gmt: string }[];
    return list.map((p) => ({ externalPostId: String(p.id), url: p.link, text: stripHtml(p.title.rendered), publishedAt: toDate(`${p.date_gmt}Z`) }));
  }
}
