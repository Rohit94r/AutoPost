// Vercel build: on production deploys, apply database migrations and create the admin login
// (only if it doesn't exist yet), then build Next.js. Preview deploys never touch the database.
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set for Production in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  run("pnpm", ["run", "db:migrate"]);
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) run("pnpm", ["run", "db:seed", "--", "--if-missing"]);
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}
run("pnpm", ["exec", "next", "build"]);
