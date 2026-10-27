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

const globalForDb = globalThis as unknown as { __flowtDb?: Database; __flowtSql?: postgres.Sql };
let override: Database | undefined;

function createDb(): Database {
  if (globalForDb.__flowtDb) return globalForDb.__flowtDb;
  // Serverless (Vercel) runs many small instances: keep each pool small and use the pooled Neon URL.
  const { url, options } = pgConnection(env().DATABASE_URL, { max: Number(process.env.DATABASE_POOL_SIZE || (process.env.VERCEL ? 5 : 10)) });
  const sql = postgres(url, options);
  const db = drizzle(sql, { schema }) as unknown as Database;
  globalForDb.__flowtDb = db;
  globalForDb.__flowtSql = sql;
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
  await globalForDb.__flowtSql?.end({ timeout: 5 });
  globalForDb.__flowtDb = undefined;
  globalForDb.__flowtSql = undefined;
}
