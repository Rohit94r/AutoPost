// Local Postgres without Docker: PGlite (Postgres compiled to WASM) behind a Postgres-wire socket.
// Data lives outside the repo (~/.flowt/pglite by default) so the Next.js file watcher
// doesn't rebuild on every database write.
//   pnpm db:local            → postgres://postgres:postgres@127.0.0.1:5433/postgres
//   PGLITE_DIR=… PGLITE_PORT=… pnpm db:local
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dir = process.env.PGLITE_DIR ?? join(homedir(), ".flowt", "pglite");
const port = Number(process.env.PGLITE_PORT ?? 5433);
mkdirSync(dir, { recursive: true });

const db = await PGlite.create(dir);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
await server.start();
console.log(`Local database ready: ${dir}`);
console.log(`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
