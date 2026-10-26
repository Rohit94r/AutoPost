/* Applies SQL migrations from ./drizzle. Run with `pnpm db:migrate`. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationUrl, pgConnection } from "./connection";

async function main() {
  const raw = migrationUrl();
  if (!raw) throw new Error("DATABASE_URL is not set");
  // Prefer the direct endpoint (DATABASE_URL_UNPOOLED / DIRECT_URL): DDL and the migration lock belong on a real session.
  const { url, options, pooled } = pgConnection(raw, { max: 1 });
  if (pooled) console.warn("Running migrations through a pooled endpoint. Set DATABASE_URL_UNPOOLED to the direct URL if this fails.");
  const sql = postgres(url, { ...options, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
