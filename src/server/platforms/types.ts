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

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly usesPkce: boolean;
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
