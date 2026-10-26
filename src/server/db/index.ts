import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { env } from "@/server/env";
import { pgConnection } from "./connection";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;
export { schema };

const globalForDb = globalThis as unknown as { __verdantDb?: Database; __verdantSql?: postgres.Sql };
let override: Database | undefined;

function createDb(): Database {
  if (globalForDb.__verdantDb) return globalForDb.__verdantDb;
  const { url, options } = pgConnection(env().DATABASE_URL, { max: Number(process.env.DATABASE_POOL_SIZE || 10) });
  const sql = postgres(url, options);
  const db = drizzle(sql, { schema }) as unknown as Database;
  globalForDb.__verdantDb = db;
  globalForDb.__verdantSql = sql;
  return db;
}

export function getDb(): Database {
  return override ?? createDb();
}

/** Lazily-initialised database handle (no connection is opened at import time). */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** Tests inject an in-process PGlite database here. */
export function setDbForTesting(testDb: Database | undefined) {
  override = testDb;
}

export async function closeDb() {
  await globalForDb.__verdantSql?.end({ timeout: 5 });
  globalForDb.__verdantDb = undefined;
  globalForDb.__verdantSql = undefined;
}
