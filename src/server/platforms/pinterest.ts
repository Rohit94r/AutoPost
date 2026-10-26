import "server-only";
import { env } from "@/server/env";
import { BaseAdapter, meta } from "./base";
import { bearer, errorFromStatus, expiresAtFrom, platformFetch, readJson } from "./http";
import { PlatformError, type AccountStats, type ConnectedProfile, type MetricValue, type PublishInput, type PublishResult, type TokenSet } from "./types";

/**
 * Pinterest API v5. Pins are created on a board chosen in the account settings (defaults to the
 * first board). Trial-access apps create sandboxed Pins visible only to you.
 * Docs: developers.pinterest.com/docs/api/v5
 */
const API = "https://api.pinterest.com/v5";

export class PinterestAdapter extends BaseAdapter {
  readonly platform = "pinterest" as const;

  private get cfg() {
    const e = env();
    return { id: e.PINTEREST_APP_ID, secret: e.PINTEREST_APP_SECRET };
  }
  override isConfigured() {
    return Boolean(this.cfg.id && this.cfg.secret);
  }
  override requestedScopes() {
    return ["boards:read", "pins:read", "pins:write", "user_accounts:read"];
  }
  override requiredPublishScopes() {
    return ["pins:write", "boards:read"];
  }

  private async fail(res: Response): Promise<never> {
    const b = (await readJson(res)) as { code?: number; message?: string };
    const msg = b.message ? `Pinterest: ${b.message}` : "";
    if (res.status === 401) throw new PlatformError("auth", "Pinterest access expired. Reconnect the account.");
    throw errorFromStatus(res.status, msg, res);
  }

  private async call<T>(path: string, token: string, init: { method?: string; body?: unknown } = {}, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const res = await platformFetch(
      `${API}${path}`,
      { method: init.method ?? "GET", headers: { ...bearer(token), ...(init.body ? { "Content-Type": "application/json" } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined },
      opts,
    );
    if (!res.ok) await this.fail(res);
    return (await readJson(res)) as T;
  }

  override buildAuthorizeUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL("https://www.pinterest.com/oauth/");
    u.searchParams.set("client_id", this.cfg.id!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.requestedScopes().join(","));
    u.searchParams.set("state", state);
    return u.toString();
  }

  private async token(params: Record<string, string>): Promise<TokenSet> {
    const res = await platformFetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.cfg.id}:${this.cfg.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    if (!res.ok) await this.fail(res);
    const b = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string };
    if (!b.access_token) throw new PlatformError("auth", "Pinterest did not return an access token.");
    return { accessToken: b.access_token, refreshToken: b.refresh_token ?? null, expiresAt: expiresAtFrom(b.expires_in), refreshTokenExpiresAt: expiresAtFrom(b.refresh_token_expires_in), scopes: (b.scope ?? "").split(/[ ,]+/).filter(Boolean) };
  }

  override exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }) {
    return this.token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  }
  override canRefresh(t: { refreshToken?: string | null }) {
    return Boolean(t.refreshToken);
  }
  /** Continuous refresh: every refresh returns a new refresh token, which must be stored. */
  override refresh({ refreshToken }: { refreshToken?: string | null }) {
    if (!refreshToken) throw new PlatformError("auth", "No Pinterest refresh token. Reconnect.");
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  override async fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]> {
    const me = await this.call<{ username: string; profile_image?: string; account_type?: string; business_name?: string }>("/user_account", tokens.accessToken);
    const boards = await this.call<{ items?: { id: string; name: string }[] }>("/boards?page_size=100", tokens.accessToken).catch(() => ({ items: [] }));
    const list = boards.items ?? [];
    return [
      {
        externalId: me.username,
        displayName: me.business_name || me.username,
        username: me.username,
        avatarUrl: me.profile_image ?? null,
        accountType: (me.account_type ?? "pinner").toLowerCase(),
        eligible: list.length > 0,
        eligibilityReason: list.length ? undefined : "Create at least one board on Pinterest, then reconnect.",
        metadata: { boards: list.slice(0, 100), boardId: list[0]?.id ?? null },
      },
    ];
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const image = input.media.find((m) => m.kind === "image");
    if (!image) throw new PlatformError("validation", "Pinterest Pins need an image.");
    const boardId = meta(input.account, "boardId");
    if (!boardId) throw new PlatformError("validation", "Choose a Pinterest board for this account in Accounts → Settings.");
    const title = (input.title?.trim() || input.text.split("\n")[0] || "").slice(0, 100);
    const pin = await this.call<{ id: string }>(
      "/pins",
      input.accessToken,
      {
        method: "POST",
        body: {
          board_id: boardId,
          title,
          description: input.text.slice(0, 500),
          ...(input.linkUrl ? { link: input.linkUrl } : {}),
          ...(image.altText ? { alt_text: image.altText.slice(0, 500) } : {}),
          media_source: { source_type: "image_url", url: await image.publicUrl(3600) },
        },
      },
      { ambiguous: true },
    );
    return { externalPostId: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` };
  }

  override async fetchMetrics({ accessToken, externalPostId }: { accessToken: string; externalPostId: string }): Promise<MetricValue[]> {
    const end = new Date();
    const start = new Date(end.getTime() - 89 * 86400_000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    try {
      const r = await this.call<{ all?: { lifetime_metrics?: Record<string, number> } }>(
        `/pins/${externalPostId}/analytics?start_date=${d(start)}&end_date=${d(end)}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK&app_types=ALL`,
        accessToken,
      );
      const m = r.all?.lifetime_metrics ?? {};
      const pick = (k: string) => (typeof m[k] === "number" ? m[k]! : null);
      return [
        { metric: "impressions", value: pick("IMPRESSION"), availability: pick("IMPRESSION") === null ? "unavailable" : "available" },
        { metric: "saves", value: pick("SAVE"), availability: pick("SAVE") === null ? "unavailable" : "available" },
        { metric: "clicks", value: pick("PIN_CLICK"), availability: pick("PIN_CLICK") === null ? "unavailable" : "available" },
        { metric: "outbound_clicks", value: pick("OUTBOUND_CLICK"), availability: pick("OUTBOUND_CLICK") === null ? "unavailable" : "available" },
      ];
    } catch (err) {
      if (err instanceof PlatformError && err.kind === "permission") return [{ metric: "impressions", value: null, availability: "permission_missing", note: "Pin analytics need a Pinterest business account." }];
      throw err;
    }
  }

  async fetchAccountStats({ accessToken }: { accessToken: string }): Promise<AccountStats> {
    const me = await this.call<{ follower_count?: number; following_count?: number; pin_count?: number; monthly_views?: number }>("/user_account", accessToken);
    return { followers: me.follower_count ?? null, following: me.following_count ?? null, posts: me.pin_count ?? null, monthlyViews: me.monthly_views ?? null };
  }
}
