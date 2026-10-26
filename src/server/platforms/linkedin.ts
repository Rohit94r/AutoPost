import "server-only";
import { env } from "@/server/env";
import { errorFromStatus, expiresAtFrom, platformFetch, readJson, sleep } from "./http";
import { PlatformError, type ConnectedProfile, type EngagementInput, type MetricValue, type PlatformAdapter, type PublishInput, type PublishResult, type ReplyInput, type TokenSet } from "./types";

/**
 * LinkedIn adapter — Sign In with LinkedIn (OIDC) + Share on LinkedIn (Posts API, versioned REST).
 * Docs: learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
 */
const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

/** "little" text format: escape reserved characters; turn #tags into hashtag templates. */
export function toLittleText(text: string): string {
  const escape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = (m.index ?? 0) + m[1]!.length;
    parts.push(escape(text.slice(last, start)));
    parts.push(`{hashtag|\\#|${m[2]}}`);
    last = start + 1 + m[2]!.length;
  }
  parts.push(escape(text.slice(last)));
  return parts.join("");
}

export const linkedinPostUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

export class LinkedInAdapter implements PlatformAdapter {
  readonly platform = "linkedin" as const;
  readonly usesPkce = false;

  private get cfg() {
    const e = env();
    return { id: e.LINKEDIN_CLIENT_ID, secret: e.LINKEDIN_CLIENT_SECRET, version: e.LINKEDIN_API_VERSION, orgs: e.LINKEDIN_ENABLE_ORGANIZATIONS };
  }

  isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }

  requestedScopes() {
    const base = ["openid", "profile", "email", "w_member_social"];
    return this.cfg.orgs ? [...base, "w_organization_social", "r_organization_social"] : base;
  }

  requiredPublishScopes() {
    return ["w_member_social"];
  }

  private headers(token: string, extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": this.cfg.version,
      "X-Restli-Protocol-Version": "2.0.0",
      ...extra,
    };
  }

  private async fail(res: Response): Promise<never> {
    const body = (await readJson(res)) as { message?: string; serviceErrorCode?: number; code?: string };
    const requestId = res.headers.get("x-li-uuid") ?? res.headers.get("x-restli-id");
    let message = body.message ?? "";
    if (res.status === 403 && /scope|permission|ACCESS_DENIED/i.test(`${message} ${body.code ?? ""}`)) {
      message = `LinkedIn denied permission (${message || "missing scope"}). Make sure the app has the "Share on LinkedIn" product and reconnect.`;
    }
    if (res.status === 426 || /version/i.test(message)) {
      throw new PlatformError("permission", `LinkedIn API version ${this.cfg.version} is not supported. Update LINKEDIN_API_VERSION.`, { status: res.status, requestId });
    }
    throw errorFromStatus(res.status, message ? `LinkedIn: ${message}` : "", res, requestId);
  }

  buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("scope", this.requestedScopes().join(" "));
    return u.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<TokenSet> {
    const res = await platformFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: this.cfg.id!, client_secret: this.cfg.secret! }),
    });
    if (!res.ok) await this.fail(res);
    return this.parseToken(await readJson(res));
  }

  private parseToken(raw: unknown): TokenSet {
    const b = raw as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };
    if (!b.access_token) throw new PlatformError("auth", "LinkedIn did not return an access token.");
    return {
      accessToken: b.access_token,
      refreshToken: b.refresh_token ?? null,
      expiresAt: expiresAtFrom(b.expires_in),
      refreshTokenExpiresAt: expiresAtFrom(b.refresh_token_expires_in),
      scopes: (b.scope ?? "").split(/[ ,]+/).filter(Boolean),
    };
  }

  /** Programmatic refresh tokens exist only for approved partners. */
  canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }

  async refresh({ refreshToken }: { refreshToken?: string | null }): Promise<TokenSet> {
    if (!refreshToken) throw new PlatformError("auth", "LinkedIn tokens can't be refreshed for this app. Reconnect the account.");
    const res = await platformFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: this.cfg.id!, client_secret: this.cfg.secret! }),
    });
    if (!res.ok) await this.fail(res);
    return this.parseToken(await readJson(res));
  }

  async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const res = await platformFetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    if (!res.ok) await this.fail(res);
    const u = (await readJson(res)) as { sub?: string; name?: string; picture?: string; email?: string };
    if (!u.sub) throw new PlatformError("auth", "LinkedIn did not return the member id.");
    const canPost = tokens.scopes.length === 0 || tokens.scopes.includes("w_member_social");
    const accounts: ConnectedProfile[] = [
      {
        externalId: `urn:li:person:${u.sub}`,
        displayName: u.name ?? "LinkedIn member",
        username: u.email ?? null,
        avatarUrl: u.picture ?? null,
        accountType: "member",
        eligible: canPost,
        eligibilityReason: canPost ? undefined : "The w_member_social permission was not granted.",
      },
    ];
    if (this.cfg.orgs && tokens.scopes.includes("w_organization_social")) {
      accounts.push(...(await this.fetchOrganizations(tokens.accessToken)));
    }
    return accounts;
  }

  private async fetchOrganizations(token: string): Promise<ConnectedProfile[]> {
    const res = await platformFetch(`${API}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, { headers: this.headers(token) });
    if (!res.ok) return [];
    const body = (await readJson(res)) as { elements?: { organization?: string }[] };
    const out: ConnectedProfile[] = [];
    for (const el of body.elements ?? []) {
      if (!el.organization) continue;
      const id = el.organization.split(":").pop();
      const orgRes = await platformFetch(`${API}/rest/organizations/${id}`, { headers: this.headers(token) });
      const org = orgRes.ok ? ((await readJson(orgRes)) as { localizedName?: string; vanityName?: string }) : {};
      out.push({
        externalId: el.organization,
        displayName: org.localizedName ?? `Organization ${id}`,
        username: org.vanityName ?? null,
        accountType: "organization",
        eligible: true,
      });
    }
    return out;
  }

  async revoke() {
    // LinkedIn documents no token revocation endpoint; tokens are deleted locally.
    return { revoked: false, note: "LinkedIn has no revocation API. Remove app access at linkedin.com/psettings/permitted-services." };
  }

  private async uploadImage(token: string, owner: string, data: Buffer, signal?: AbortSignal): Promise<string> {
    const init = await platformFetch(`${API}/rest/images?action=initializeUpload`, {
      method: "POST",
      headers: this.headers(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
      signal,
    });
    if (!init.ok) await this.fail(init);
    const { value } = (await readJson(init)) as { value?: { uploadUrl?: string; image?: string } };
    if (!value?.uploadUrl || !value.image) throw new PlatformError("media", "LinkedIn did not return an image upload URL.");
    const put = await platformFetch(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: new Uint8Array(data), signal }, { timeoutMs: 120_000 });
    if (!put.ok) await this.fail(put);
    return value.image;
  }

  private async uploadVideo(token: string, owner: string, data: Buffer, signal?: AbortSignal): Promise<string> {
    const init = await platformFetch(`${API}/rest/videos?action=initializeUpload`, {
      method: "POST",
      headers: this.headers(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: data.length, uploadCaptions: false, uploadThumbnail: false } }),
      signal,
    });
    if (!init.ok) await this.fail(init);
    const { value } = (await readJson(init)) as {
      value?: { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] };
    };
    if (!value?.video || !value.uploadInstructions?.length) throw new PlatformError("media", "LinkedIn did not return video upload instructions.");
    const etags: string[] = [];
    for (const part of value.uploadInstructions) {
      const chunk = data.subarray(part.firstByte, part.lastByte + 1);
      const put = await platformFetch(
        part.uploadUrl,
        { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: new Uint8Array(chunk), signal },
        { timeoutMs: 300_000 },
      );
      if (!put.ok) await this.fail(put);
      const etag = put.headers.get("etag");
      if (!etag) throw new PlatformError("media", "LinkedIn video upload did not return an ETag.");
      etags.push(etag);
    }
    const fin = await platformFetch(`${API}/rest/videos?action=finalizeUpload`, {
      method: "POST",
      headers: this.headers(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? "", uploadedPartIds: etags } }),
      signal,
    });
    if (!fin.ok) await this.fail(fin);
    // Poll processing status (best effort — some permission sets cannot read video status).
    for (let i = 0; i < 60; i++) {
      const st = await platformFetch(`${API}/rest/videos/${encodeURIComponent(value.video)}`, { headers: this.headers(token), signal });
      if (st.status === 403 || st.status === 404) {
        await sleep(15_000, signal);
        break;
      }
      if (!st.ok) await this.fail(st);
      const v = (await readJson(st)) as { status?: string; processingFailureReason?: string };
      if (v.status === "AVAILABLE") break;
      if (v.status === "PROCESSING_FAILED") throw new PlatformError("media", `LinkedIn could not process the video: ${v.processingFailureReason ?? "unknown reason"}.`);
      await sleep(5_000, signal);
    }
    return value.video;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const author = input.account.externalAccountId;
    const body: Record<string, unknown> = {
      author,
      commentary: toLittleText(input.text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    const media = input.media[0];
    if (input.media.length > 1) throw new PlatformError("validation", "LinkedIn posts here support one image or one video.");
    if (media) {
      const data = await media.load();
      if (media.kind === "image") {
        const image = await this.uploadImage(input.accessToken, author, data, input.signal);
        body.content = { media: { id: image, altText: media.altText ?? undefined } };
      } else {
        const video = await this.uploadVideo(input.accessToken, author, data, input.signal);
        body.content = { media: { id: video, title: input.text.split("\n")[0]?.slice(0, 100) || "Video" } };
      }
    }
    const res = await platformFetch(
      `${API}/rest/posts`,
      { method: "POST", headers: this.headers(input.accessToken, { "Content-Type": "application/json" }), body: JSON.stringify(body) },
      { ambiguous: true, timeoutMs: 60_000 },
    );
    if (res.status !== 201 && !res.ok) await this.fail(res);
    const urn = res.headers.get("x-restli-id");
    if (!urn) {
      throw new PlatformError("ambiguous", "LinkedIn accepted the request but did not return a post id. Check your profile before retrying.");
    }
    return { externalPostId: urn, url: linkedinPostUrl(urn), platformRequestId: res.headers.get("x-li-uuid") };
  }

  async fetchMetrics({ accessToken, externalPostId, grantedScopes }: { accessToken: string; externalPostId: string; grantedScopes: string[] }): Promise<MetricValue[]> {
    const map = { impressions: "IMPRESSION", reach: "MEMBERS_REACHED", reactions: "REACTION", comments: "COMMENT", reposts: "RESHARE" } as const;
    if (!grantedScopes.includes("r_member_postAnalytics")) {
      return Object.keys(map).map((metric) => ({
        metric,
        value: null,
        availability: "permission_missing" as const,
        note: "Requires r_member_postAnalytics (Community Management API approval).",
      }));
    }
    const kind = externalPostId.includes(":ugcPost:") ? "ugc" : "share";
    const out: MetricValue[] = [];
    for (const [metric, queryType] of Object.entries(map)) {
      const url = `${API}/rest/memberCreatorPostAnalytics?q=entity&entity=(${kind}:${encodeURIComponent(externalPostId)})&queryType=${queryType}&aggregation=TOTAL`;
      const res = await platformFetch(url, { headers: this.headers(accessToken) });
      if (!res.ok) {
        out.push({ metric, value: null, availability: res.status === 403 ? "permission_missing" : "unavailable" });
        continue;
      }
      const body = (await readJson(res)) as { elements?: { count?: number }[] };
      const total = (body.elements ?? []).reduce((s, e) => s + (e.count ?? 0), 0);
      out.push({ metric, value: total, availability: "available" });
    }
    return out;
  }

  /**
   * Comments via the Comments API (socialActions). Requires Community Management API access and
   * works for organization pages; reading member-post comments is restricted by LinkedIn.
   */
  async fetchComments({ accessToken, account, postExternalId }: { accessToken: string; account: PublishInput["account"]; postExternalId: string }): Promise<EngagementInput[]> {
    if (account.accountType !== "organization") return [];
    const res = await platformFetch(`${API}/rest/socialActions/${encodeURIComponent(postExternalId)}/comments?count=50`, { headers: this.headers(accessToken) });
    if (!res.ok) await this.fail(res);
    const body = (await readJson(res)) as {
      elements?: { id?: string; commentUrn?: string; actor?: string; message?: { text?: string }; created?: { time?: number }; parentComment?: string }[];
    };
    return (body.elements ?? [])
      .filter((c) => c.commentUrn)
      .map((c) => ({
        externalId: c.commentUrn!,
        kind: c.parentComment ? ("reply" as const) : ("comment" as const),
        postExternalId,
        parentExternalId: c.parentComment ?? postExternalId,
        authorName: c.actor?.startsWith("urn:li:organization:") ? "Your page" : "LinkedIn member",
        authorExternalId: c.actor ?? null,
        text: c.message?.text ?? "",
        permalink: linkedinPostUrl(postExternalId),
        occurredAt: c.created?.time ? new Date(c.created.time) : new Date(),
        replyTarget: { postUrn: postExternalId },
        isOwn: c.actor === account.externalAccountId,
      }));
  }

  async reply({ accessToken, account, target, text }: ReplyInput) {
    if (account.accountType !== "organization") throw new PlatformError("permission", "LinkedIn only allows API comments as an organization page (Community Management API).");
    const postUrn = target.replyTarget.postUrn ?? target.postExternalId ?? "";
    const res = await platformFetch(
      `${API}/rest/socialActions/${encodeURIComponent(target.externalId)}/comments`,
      {
        method: "POST",
        headers: this.headers(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ actor: account.externalAccountId, object: postUrn, message: { text: toLittleText(text) }, parentComment: target.externalId }),
      },
      { ambiguous: true },
    );
    if (!res.ok) await this.fail(res);
    const id = res.headers.get("x-restli-id") ?? ((await readJson(res)) as { commentUrn?: string }).commentUrn;
    if (!id) throw new PlatformError("ambiguous", "LinkedIn didn't confirm the reply.");
    return { externalId: id };
  }

}
