import "server-only";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { authAccounts, users } from "@/server/db/schema";
import { ensurePersonalWorkspace } from "@/server/workspaces/service";

/**
 * Creates (or updates) a ready-to-use email/password account: verified email, onboarding done,
 * personal workspace created. Idempotent — running it again resets the password, unless
 * `ifMissing` is set (used on deploy), in which case an existing login is left untouched.
 * Credentials come from the caller (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), never from source.
 */
export async function seedLoginUser(input: { email: string; password: string; name?: string; ifMissing?: boolean }, conn: DbOrTx = db) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("SEED_ADMIN_EMAIL is not a valid email");
  if (input.password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");
  const hash = await hashPassword(input.password);
  const name = input.name?.trim() || email.split("@")[0]!;

  const [existing] = await conn.select().from(users).where(eq(users.email, email));
  if (existing && input.ifMissing) return { userId: existing.id, workspaceId: null, created: false };
  const userId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await conn.update(users).set({ emailVerified: true, onboardingCompletedAt: existing.onboardingCompletedAt ?? new Date() }).where(eq(users.id, userId));
  } else {
    await conn.insert(users).values({ id: userId, name, email, emailVerified: true, onboardingCompletedAt: new Date() });
  }

  const [cred] = await conn
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "credential")));
  if (cred) {
    await conn.update(authAccounts).set({ password: hash }).where(eq(authAccounts.id, cred.id));
  } else {
    await conn.insert(authAccounts).values({ id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: hash });
  }

  const workspaceId = await ensurePersonalWorkspace({ id: userId, name, email }, conn);
  return { userId, workspaceId, created: !existing };
}
