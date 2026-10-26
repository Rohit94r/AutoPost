/* Creates the login from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Run with `pnpm db:seed`. */
import { seedLoginUser } from "@/server/account/seed";
import { closeDb } from "@/server/db";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (in .env.local) first.");
  const r = await seedLoginUser({ email, password, name: process.env.SEED_ADMIN_NAME });
  console.log(`${r.created ? "created" : "updated"} login ${email} (workspace ${r.workspaceId})`);
}

main()
  .catch((err) => {
    console.error("seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
