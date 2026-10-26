import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { encrypt } from "@/server/crypto";
import { setDbForTesting, type Database } from "@/server/db";
import * as schema from "@/server/db/schema";
import { setStorageForTesting, type StorageDriver } from "@/server/storage";

/** Fresh in-process Postgres (PGlite) with all migrations applied. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  setDbForTesting(db);
  const mem = new Map<string, Buffer>();
  const store: StorageDriver = {
    put: async (k, d) => void mem.set(k, d),
    get: async (k) => {
      const v = mem.get(k);
      if (!v) throw new Error("missing");
      return v;
    },
    delete: async (k) => void mem.delete(k),
    publicUrl: async (k) => `https://media.example.test/${k}`,
  };
  setStorageForTesting(store);
  return {
    db,
    mem,
    close: async () => {
      setDbForTesting(undefined);
      setStorageForTesting(undefined);
      await client.close();
    },
  };
}

let seq = 0;

export async function seedUserWorkspace(db: Database, opts: { plan?: string; role?: "owner" | "admin" | "editor" | "viewer" } = {}) {
  seq++;
  const userId = `user-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.users).values({ id: userId, name: `User ${seq}`, email: `${userId}@example.test` });
  const [ws] = await db.insert(schema.workspaces).values({ name: `WS ${seq}`, slug: `ws-${userId}`, plan: opts.plan ?? "pro" }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: ws!.id, userId, role: opts.role ?? "owner" });
  return { userId, workspaceId: ws!.id };
}

export async function seedAccount(
  db: Database,
  workspaceId: string,
  platform: "linkedin" | "instagram" | "x",
  over: Partial<typeof schema.socialAccounts.$inferInsert> = {},
) {
  const [acct] = await db
    .insert(schema.socialAccounts)
    .values({
      workspaceId,
      platform,
      externalAccountId: `${platform}-${Math.random().toString(36).slice(2)}`,
      displayName: `${platform} account`,
      username: `${platform}_user`,
      status: "connected",
      grantedScopes: [],
      tokenExpiresAt: new Date(Date.now() + 30 * 86400_000),
      ...over,
    })
    .returning();
  await db.insert(schema.oauthCredentials).values({ socialAccountId: acct!.id, accessTokenEnc: encrypt(`token-${acct!.id}`), refreshTokenEnc: null });
  return acct!;
}
