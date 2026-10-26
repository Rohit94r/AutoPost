import type { Platform } from "@/lib/platforms";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scopes: string[];
  /** Platform account id returned during token exchange (Instagram). */
  userId?: string | null;
}

export interface ConnectedProfile {
  externalId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  accountType: string;
  /** False when the account exists but cannot publish via the API (e.g. personal Instagram). */
  eligible: boolean;
  eligibilityReason?: string;
  metadata?: Record<string, unknown>;
}

export interface PreparedMedia {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  load(): Promise<Buffer>;
  /** URL the platform can fetch for `ttlSec` seconds (signed). */
  publicUrl(ttlSec: number): Promise<string>;
}

export interface PublishInput {
  accessToken: string;
  account: { externalAccountId: string; accountType: string; username?: string | null; metadata: Record<string, unknown> };
  text: string;
  media: PreparedMedia[];
  /** Post title, used where the platform needs one (YouTube, Reddit, Pinterest, WordPress). */
  title?: string | null;
  /** The post's link, for platforms with a dedicated link field (Pinterest, Facebook). */
  linkUrl?: string | null;
  /** Stable per-destination key (the publishing job id) for platforms that de-duplicate requests. */
  idempotencyKey?: string;
  /** Hook for long operations (media processing) to report progress / respect shutdown. */
  signal?: AbortSignal;
}

export interface PublishResult {
  externalPostId: string;
  url: string | null;
  platformRequestId?: string | null;
}

export interface MetricValue {
  metric: string;
  value: number | null;
  availability: "available" | "unsupported" | "permission_missing" | "unavailable";
  note?: string;
}

/** A field the user fills in to connect a credential-based platform (Bluesky, Mastodon, …). */
export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
  required?: boolean;
}

/** A comment, reply or mention fetched from a platform. */
export interface EngagementInput {
  externalId: string;
  kind: "comment" | "reply" | "mention";
  postExternalId?: string | null;
  parentExternalId?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  authorExternalId?: string | null;
  authorAvatarUrl?: string | null;
  text: string;
  permalink?: string | null;
  occurredAt: Date;
  /** Extra identifiers needed to reply later (e.g. Bluesky uri/cid of root and parent). */
  replyTarget?: Record<string, string>;
  /** Written by the connected account itself (never auto-replied to). */
  isOwn?: boolean;
}

export interface ReplyInput {
  accessToken: string;
  account: PublishInput["account"];
  target: { externalId: string; postExternalId?: string | null; replyTarget: Record<string, string | undefined> };
  text: string;
}

export interface RemotePost {
  externalPostId: string;
  url: string | null;
  text: string | null;
  thumbnailUrl?: string | null;
  publishedAt: Date;
}

export type AccountStats = Record<string, number | null>;

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly usesPkce: boolean;
  /** Credential-based platforms: fields shown in the connect form. */
  credentialFields?(): CredentialField[];
  /** Credential-based platforms: validate the credentials and describe the account(s). */
  connectWithCredentials?(values: Record<string, string>): Promise<{ tokens: TokenSet; profiles: ConnectedProfile[] }>;
  /** Comments/replies on one of the account's posts. */
  fetchComments?(input: { accessToken: string; account: PublishInput["account"]; postExternalId: string; since?: Date | null }): Promise<EngagementInput[]>;
  /** Mentions of the account anywhere on the platform. */
  fetchMentions?(input: { accessToken: string; account: PublishInput["account"]; since?: Date | null }): Promise<EngagementInput[]>;
  /** Reply to a comment or mention. Returns the platform id of the reply. */
  reply?(input: ReplyInput): Promise<{ externalId: string; url?: string | null }>;
  /** Recent posts on the account (including ones not published through Verdant). */
  fetchRecentPosts?(input: { accessToken: string; account: PublishInput["account"]; limit: number }): Promise<RemotePost[]>;
  /** Account-level numbers such as followers. */
  fetchAccountStats?(input: { accessToken: string; account: PublishInput["account"] }): Promise<AccountStats>;
  isConfigured(): boolean;
  requestedScopes(): string[];
  /** Scopes without which publishing cannot work. */
  requiredPublishScopes(): string[];
  buildAuthorizeUrl(p: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCode(p: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet>;
  /** Whether a refresh is possible for these tokens (some platforms don't issue refresh tokens). */
  canRefresh(t: { refreshToken?: string | null; accessToken: string; tokenExpiresAt?: Date | null; lastRefreshedAt?: Date | null; createdAt?: Date }): boolean;
  refresh(t: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet>;
  fetchAccounts(tokens: TokenSet): Promise<ConnectedProfile[]>;
  revoke(t: { accessToken: string; refreshToken?: string | null }): Promise<{ revoked: boolean; note?: string }>;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(input: { accessToken: string; externalPostId: string; grantedScopes: string[]; account: PublishInput["account"] }): Promise<MetricValue[]>;
}

export type PlatformErrorKind =
  | "auth" // token invalid/expired/revoked → needs reconnection
  | "permission" // missing scope / access tier / account not eligible → permanent
  | "rate_limit" // retry after a delay
  | "transient" // 5xx / network before the create call → retry
  | "validation" // content rejected → permanent
  | "media" // media processing failed → permanent
  | "ambiguous" // the create call may or may not have succeeded → never auto-retry
  | "not_configured";

export class PlatformError extends Error {
  constructor(
    public readonly kind: PlatformErrorKind,
    message: string,
    public readonly opts: { status?: number; code?: string; retryAfterSec?: number; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = "PlatformError";
  }
}
