import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Platform } from "@/lib/platforms";
import { audit } from "@/server/audit";
import { decrypt, encrypt, randomToken, sha256 } from "@/server/crypto";
import { db, type DbOrTx } from "@/server/db";
import { oauthCredentials, oauthStates, publishingJobs, socialAccounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError, badRequest, notConfigured, notFound } from "@/server/errors";
import { logger } from "@/server/logger";
import { getAdapter } from "@/server/platforms/registry";
import { PlatformError, type TokenSet } from "@/server/platforms/types";
import { assertQuota } from "@/server/usage/service";

const STATE_TTL_MS = 10 * 60_000;

export const redirectUriFor = (platform: Platform) => `${env().APP_BASE_URL}/api/v1/social-accounts/${platform}/callback`;

export function pkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Step 1: create a single-use state (CSRF) and return the platform's authorization URL. */
export async function startConnect(input: { workspaceId: string; userId: string; platform: Platform; returnTo?: string }) {
  const adapter = getAdapter(input.platform);
  if (!adapter.isConfigured()) throw notConfigured(`${input.platform} OAuth`);
  await assertQuota(input.workspaceId, "account");
  const state = randomToken(32);
  const pkce = adapter.usesPkce ? pkcePair() : null;
  const returnTo = input.returnTo?.startsWith("/") && !input.returnTo.startsWith("//") ? input.returnTo : "/accounts";
  await db.insert(oauthStates).values({
    stateHash: sha256(state),
    workspaceId: input.workspaceId,
    userId: input.userId,
    platform: input.platform,
    codeVerifierEnc: pkce ? encrypt(pkce.verifier) : null,
    returnTo,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return adapter.buildAuthorizeUrl({ state, redirectUri: redirectUriFor(input.platform), codeChallenge: pkce?.challenge });
}

/** Atomically consumes a state; returns null if unknown, expired, reused, or for another user/platform. */
export async function consumeState(state: string, platform: Platform, userId: string, conn: DbOrTx = db) {
  if (!state || state.length > 200) return null;
  const [row] = await conn
    .update(oauthStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthStates.stateHash, sha256(state)),
        eq(oauthStates.platform, platform),
        eq(oauthStates.userId, userId),
        isNull(oauthStates.consumedAt),
        gt(oauthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  return row ?? null;
}

function statusFor(platform: Platform, tokens: TokenSet, eligible: boolean) {
  const required = getAdapter(platform).requiredPublishScopes();
  const missing = tokens.scopes.length ? required.filter((s) => !tokens.scopes.includes(s)) : [];
  if (!eligible || missing.length) return { status: "permission_required" as const, missing };
  return { status: "connected" as const, missing };
}

/** Step 2: validate state, exchange code, store encrypted tokens, upsert accounts. */
export async function completeConnect(input: { platform: Platform; state: string; code: string; userId: string; req?: Request; correlationId?: string }) {
  const stateRow = await consumeState(input.state, input.platform, input.userId);
  if (!stateRow) throw badRequest("This connection link is invalid or expired. Please try connecting again.");
  const adapter = getAdapter(input.platform);
  const tokens = await adapter.exchangeCode({
    code: input.code,
    redirectUri: redirectUriFor(input.platform),
    codeVerifier: stateRow.codeVerifierEnc ? decrypt(stateRow.codeVerifierEnc) : undefined,
  });
  const profiles = await adapter.fetchAccounts(tokens);
  const results: { id: string; displayName: string; status: string; reason?: string }[] = [];

  await db.transaction(async (tx) => {
    for (const p of profiles) {
      const { status, missing } = statusFor(input.platform, tokens, p.eligible);
      const reason = p.eligibilityReason ?? (missing.length ? `Missing permissions: ${missing.join(", ")}` : null);
      const values = {
        workspaceId: stateRow.workspaceId,
        platform: input.platform,
        externalAccountId: p.externalId,
        accountType: p.accountType,
        displayName: p.displayName,
        username: p.username ?? null,
        avatarUrl: p.avatarUrl ?? null,
        status,
        grantedScopes: tokens.scopes,
        tokenExpiresAt: tokens.expiresAt ?? null,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
        lastRefreshedAt: new Date(),
        lastError: reason,
        metadata: p.metadata ?? {},
        connectedBy: input.userId,
        disconnectedAt: null,
      };
      const [acct] = await tx
        .insert(socialAccounts)
        .values(values)
        .onConflictDoUpdate({ target: [socialAccounts.workspaceId, socialAccounts.platform, socialAccounts.externalAccountId], set: { ...values, updatedAt: new Date() } })
        .returning({ id: socialAccounts.id });
      const enc = { accessTokenEnc: encrypt(tokens.accessToken), refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null };
      await tx
        .insert(oauthCredentials)
        .values({ socialAccountId: acct!.id, ...enc })
        .onConflictDoUpdate({ target: oauthCredentials.socialAccountId, set: { ...enc, updatedAt: new Date() } });
      // A reconnect revives jobs that were parked waiting for it.
      await tx
        .update(publishingJobs)
        .set({ status: "queued", nextRetryAt: null, lastErrorCode: null, lastErrorMessage: null })
        .where(and(eq(publishingJobs.socialAccountId, acct!.id), eq(publishingJobs.status, "needs_reconnection")));
      results.push({ id: acct!.id, displayName: p.displayName, status, reason: reason ?? undefined });
      await audit(
        { workspaceId: stateRow.workspaceId, actorUserId: input.userId, action: "social_account.connected", targetType: "social_account", targetId: acct!.id, metadata: { platform: input.platform, scopes: tokens.scopes, status }, req: input.req, correlationId: input.correlationId },
        tx,
      );
    }
  });
  return { workspaceId: stateRow.workspaceId, returnTo: stateRow.returnTo ?? "/accounts", accounts: results };
}

type AccountRow = typeof socialAccounts.$inferSelect;

async function loadCredentials(accountId: string, conn: DbOrTx = db) {
  const [cred] = await conn.select().from(oauthCredentials).where(eq(oauthCredentials.socialAccountId, accountId));
  if (!cred) return null;
  return { accessToken: decrypt(cred.accessTokenEnc), refreshToken: cred.refreshTokenEnc ? decrypt(cred.refreshTokenEnc) : null };
}

/**
 * Refresh tokens for one account (when supported) and persist them encrypted.
 * Serialised per account with a Postgres advisory lock: X rotates refresh tokens, so two workers
 * refreshing concurrently would invalidate each other. Inside the lock we re-read the account and
 * skip the refresh if another process already did it.
 *
 * `minValidMs`: skip when the current token is still valid for at least this long.
 */
export async function refreshAccount(account: AccountRow, opts: { minValidMs?: number } = {}): Promise<boolean> {
  const adapter = getAdapter(account.platform);
  let refreshError: unknown;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`oauth-refresh:${account.id}`}))`);
    const [fresh] = await tx.select().from(socialAccounts).where(eq(socialAccounts.id, account.id));
    if (!fresh || fresh.status === "disconnected") throw new PlatformError("auth", "This account was disconnected.");
    if (opts.minValidMs && fresh.tokenExpiresAt && fresh.tokenExpiresAt.getTime() > Date.now() + opts.minValidMs) {
      return true; // already refreshed by someone else
    }
    const creds = await loadCredentials(account.id, tx);
    if (!creds) throw new PlatformError("auth", "No stored credentials. Reconnect the account.");
    if (!adapter.canRefresh({ ...creds, tokenExpiresAt: fresh.tokenExpiresAt, lastRefreshedAt: fresh.lastRefreshedAt, createdAt: fresh.createdAt })) {
      return false;
    }
    let t: TokenSet;
    try {
      t = await adapter.refresh(creds);
    } catch (err) {
      refreshError = err; // handled after the transaction so the bookkeeping isn't rolled back
      return false;
    }
    await tx
      .update(oauthCredentials)
      .set({ accessTokenEnc: encrypt(t.accessToken), refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : creds.refreshToken ? encrypt(creds.refreshToken) : null })
      .where(eq(oauthCredentials.socialAccountId, account.id));
    await tx
      .update(socialAccounts)
      .set({
        tokenExpiresAt: t.expiresAt ?? fresh.tokenExpiresAt,
        refreshTokenExpiresAt: t.refreshTokenExpiresAt ?? fresh.refreshTokenExpiresAt,
        grantedScopes: t.scopes.length ? t.scopes : fresh.grantedScopes,
        lastRefreshedAt: new Date(),
        status: fresh.status === "expired" ? "connected" : fresh.status,
        lastError: null,
      })
      .where(eq(socialAccounts.id, account.id));
    return true;
  });

  if (refreshError) {
    if (refreshError instanceof PlatformError && refreshError.kind === "auth") {
      // The platform rejected the refresh token: the user must reconnect. Park pending posts.
      await markAccount(account.id, "expired", refreshError.message);
      await db
        .update(publishingJobs)
        .set({ status: "needs_reconnection", lastErrorCode: "auth", lastErrorMessage: refreshError.message })
        .where(and(eq(publishingJobs.socialAccountId, account.id), inArray(publishingJobs.status, ["queued", "scheduled"])));
    }
    throw refreshError;
  }
  return result;
}

export async function markAccount(accountId: string, status: AccountRow["status"], error: string | null, conn: DbOrTx = db) {
  await conn.update(socialAccounts).set({ status, lastError: error }).where(eq(socialAccounts.id, accountId));
}

const REFRESH_WINDOW_MS = 5 * 60_000;

/**
 * Returns a usable access token, refreshing first when it expires within 5 minutes.
 * - refresh rejected by the platform → account expired, auth error (job waits for reconnection)
 * - refresh failed for a transient reason → transient error (job retries later; account untouched)
 * - token expired and the platform can't refresh (e.g. LinkedIn) → account expired, auth error
 */
export async function getAccessToken(account: AccountRow): Promise<string> {
  if (account.status === "disconnected") throw new PlatformError("auth", "This account was disconnected.");
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + REFRESH_WINDOW_MS) {
    let refreshed: boolean;
    try {
      refreshed = await refreshAccount(account, { minValidMs: REFRESH_WINDOW_MS });
    } catch (err) {
      if (err instanceof PlatformError && err.kind === "auth") throw err;
      logger.warn({ err, accountId: account.id }, "token refresh failed (transient)");
      if (account.tokenExpiresAt.getTime() > Date.now()) refreshed = true; // still valid for a few minutes
      else throw new PlatformError("transient", `Couldn't refresh the ${account.platform} connection right now. Will retry.`);
    }
    if (!refreshed && account.tokenExpiresAt.getTime() < Date.now()) {
      await markAccount(account.id, "expired", "Access token expired");
      throw new PlatformError("auth", `Your ${account.platform} connection expired. Reconnect the account.`);
    }
  }
  const creds = await loadCredentials(account.id);
  if (!creds) throw new PlatformError("auth", "No stored credentials. Reconnect the account.");
  return creds.accessToken;
}

/** Disconnect: best-effort revoke, delete credentials, park pending jobs. */
export async function disconnectAccount(input: { workspaceId: string; accountId: string; userId: string; req?: Request; correlationId?: string }) {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, input.accountId), eq(socialAccounts.workspaceId, input.workspaceId)));
  if (!account) throw notFound("Account");
  let note: string | undefined;
  const creds = await loadCredentials(account.id).catch(() => null);
  if (creds) {
    try {
      note = (await getAdapter(account.platform).revoke(creds)).note;
    } catch (err) {
      logger.warn({ err, accountId: account.id }, "token revoke failed");
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(oauthCredentials).where(eq(oauthCredentials.socialAccountId, account.id));
    await tx.update(socialAccounts).set({ status: "disconnected", disconnectedAt: new Date(), lastError: null }).where(eq(socialAccounts.id, account.id));
    await tx
      .update(publishingJobs)
      .set({ status: "needs_reconnection", lastErrorCode: "account_disconnected", lastErrorMessage: "The account was disconnected before this post was published." })
      .where(and(eq(publishingJobs.socialAccountId, account.id), inArray(publishingJobs.status, ["queued", "scheduled"])));
    await audit({ workspaceId: input.workspaceId, actorUserId: input.userId, action: "social_account.disconnected", targetType: "social_account", targetId: account.id, metadata: { platform: account.platform }, req: input.req, correlationId: input.correlationId }, tx);
  });
  return { ok: true, note };
}

export async function purgeExpiredStates() {
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date(Date.now() - 3600_000)));
}

export function oauthErrorMessage(err: unknown) {
  if (err instanceof AppError) return err.message;
  if (err instanceof PlatformError) return err.message;
  return "Connecting the account failed. Please try again.";
}
