import { defineConfig } from "drizzle-kit";
import { migrationUrl, withoutClientParams } from "./src/server/db/connection";

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: withoutClientParams(migrationUrl() ?? "postgres://flowt:flowt@localhost:5432/flowt") },
  strict: true,
  verbose: true,
});
