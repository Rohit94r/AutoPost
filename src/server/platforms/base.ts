import "server-only";
import type { Platform } from "@/lib/platforms";
import { PlatformError, type ConnectedProfile, type MetricValue, type PlatformAdapter, type PublishInput, type PublishResult, type TokenSet } from "./types";

/**
 * Defaults for adapters. Credential-based platforms (Bluesky, Mastodon, Telegram, Discord,
 * WordPress, webhooks) don't use OAuth redirects; OAuth platforms override those methods.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platform: Platform;
  readonly usesPkce: boolean = false;

  isConfigured() {
    return true;
  }
  requestedScopes(): string[] {
    return [];
  }
  requiredPublishScopes(): string[] {
    return [];
  }
  buildAuthorizeUrl(_p: { state: string; redirectUri: string; codeChallenge?: string }): string {
    throw new PlatformError("not_configured", "This platform connects with credentials, not a sign-in redirect.");
  }
  async exchangeCode(_p: { code: string; redirectUri: string; codeVerifier?: string }): Promise<TokenSet> {
    throw new PlatformError("not_configured", "This platform connects with credentials, not a sign-in redirect.");
  }
  canRefresh(_t: Parameters<PlatformAdapter["canRefresh"]>[0]): boolean {
    return false;
  }
  async refresh(_t: { accessToken: string; refreshToken?: string | null }): Promise<TokenSet> {
    throw new PlatformError("auth", "This connection can't be refreshed. Reconnect the account.");
  }
  async fetchAccounts(_tokens: TokenSet): Promise<ConnectedProfile[]> {
    return [];
  }
  async revoke(_t: { accessToken: string; refreshToken?: string | null }): Promise<{ revoked: boolean; note?: string }> {
    return { revoked: false };
  }
  async fetchMetrics(_i: { accessToken: string; externalPostId: string; grantedScopes: string[]; account: PublishInput["account"] }): Promise<MetricValue[]> {
    return [];
  }
  abstract publish(input: PublishInput): Promise<PublishResult>;
}

/** Strip trailing slashes from user-entered base URLs. */
export const baseUrl = (u: string) => u.trim().replace(/\/+$/, "");

/** Read a string from account metadata (settings or connection details). */
export function meta(account: PublishInput["account"], key: string): string | undefined {
  const settings = (account.metadata?.settings ?? {}) as Record<string, unknown>;
  const v = settings[key] ?? account.metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export const toDate = (v: unknown) => {
  const d = new Date(typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : String(v ?? ""));
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
