import type postgres from "postgres";

/**
 * Turns a Postgres URL into postgres.js options that work with Neon, Supabase, RDS and local servers.
 *
 * postgres.js forwards every URL query parameter it doesn't know as a server startup parameter, and
 * Postgres rejects unknown ones ("unrecognized configuration parameter"). Neon's default connection
 * string contains `channel_binding=require`, so client-only parameters are removed here.
 * No `server-only` import: the migrate script uses this outside Next.js.
 */
const CLIENT_ONLY_PARAMS = ["channel_binding", "pgbouncer", "connection_limit", "pool_timeout", "schema", "sslcert", "sslkey", "sslrootcert", "sslpassword", "gssencmode"];

export interface PgConnection {
  url: string;
  options: postgres.Options<Record<string, postgres.PostgresType>>;
  /** True for PgBouncer-style pooled endpoints (Neon `-pooler` hosts or `?pgbouncer=true`). */
  pooled: boolean;
}

export function pgConnection(rawUrl: string, opts: { max?: number } = {}): PgConnection {
  const url = URL.canParse(rawUrl) ? new URL(rawUrl) : null;
  // Multi-host strings (h1:5432,h2:5432) aren't WHATWG URLs: pass them through untouched.
  if (!url) return { url: rawUrl, pooled: false, options: { max: opts.max ?? 10, idle_timeout: 30, connect_timeout: 15 } };
  const pooled = url.hostname.includes("-pooler.") || url.searchParams.get("pgbouncer") === "true";
  const isNeon = url.hostname.endsWith(".neon.tech");
  const sslmode = url.searchParams.get("sslmode");
  const systemRoots = url.searchParams.get("sslrootcert") === "system";
  for (const p of [...CLIENT_ONLY_PARAMS, "sslmode"]) url.searchParams.delete(p);

  return {
    url: url.toString(),
    pooled,
    options: {
      max: opts.max ?? 10,
      ssl: sslOption(sslmode, isNeon || systemRoots),
      idle_timeout: 30,
      // Neon computes that scaled to zero take a few seconds to wake up.
      connect_timeout: 15,
      // Transaction-mode poolers can't keep named prepared statements on one server connection.
      prepare: !pooled,
    },
  };
}

type Ssl = postgres.Options<Record<string, postgres.PostgresType>>["ssl"];

/** libpq sslmode → postgres.js. Hosts with publicly trusted certificates (Neon) are always verified. */
function sslOption(sslmode: string | null, verifyPublicCert: boolean): Ssl {
  if (sslmode === "disable") return false;
  if (verifyPublicCert || sslmode === "verify-full" || sslmode === "verify-ca") return "verify-full";
  if (sslmode === "require" || sslmode === "prefer" || sslmode === "allow") return sslmode;
  return false;
}

/** The URL minus client-only parameters, keeping `sslmode` (for tools with their own driver, e.g. drizzle-kit). */
export function withoutClientParams(rawUrl: string): string {
  if (!URL.canParse(rawUrl)) return rawUrl;
  const url = new URL(rawUrl);
  for (const p of CLIENT_ONLY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

/** Migrations and schema tools should use the direct (non-pooled) endpoint when one is configured. */
export function migrationUrl(env: Partial<Record<string, string>> = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DIRECT_URL || env.DATABASE_URL;
}
