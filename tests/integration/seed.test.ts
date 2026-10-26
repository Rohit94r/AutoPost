import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLoginUser } from "@/server/account/seed";
import type { Database } from "@/server/db";
import { authAccounts, users, workspaceMembers } from "@/server/db/schema";
import { createTestDb } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => t.close());

describe("seed login user", () => {
  it("creates a verified, onboarded user with a working password and workspace", async () => {
    const r = await seedLoginUser({ email: "Seed.User@Example.com", password: "Secret@94" });
    expect(r.created).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(u).toMatchObject({ email: "seed.user@example.com", emailVerified: true });
    expect(u!.onboardingCompletedAt).not.toBeNull();
    const [cred] = await db.select().from(authAccounts).where(and(eq(authAccounts.userId, r.userId), eq(authAccounts.providerId, "credential")));
    expect(await verifyPassword({ hash: cred!.password!, password: "Secret@94" })).toBe(true);
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, r.userId))).toHaveLength(1);
  });

  it("is idempotent and resets the password on re-run", async () => {
    const again = await seedLoginUser({ email: "seed.user@example.com", password: "Another@95" });
    expect(again.created).toBe(false);
    const creds = await db.select().from(authAccounts).where(eq(authAccounts.userId, again.userId));
    expect(creds).toHaveLength(1);
    expect(await verifyPassword({ hash: creds[0]!.password!, password: "Another@95" })).toBe(true);
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, again.userId))).toHaveLength(1);
  });

  it("rejects invalid input", async () => {
    await expect(seedLoginUser({ email: "nope", password: "Secret@94" })).rejects.toThrow(/valid email/);
    await expect(seedLoginUser({ email: "a@b.co", password: "short" })).rejects.toThrow(/8 characters/);
  });
});
