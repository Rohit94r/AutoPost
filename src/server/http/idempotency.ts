import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { idempotencyKeys } from "@/server/db/schema";
import { badRequest, conflict } from "@/server/errors";

/**
 * Idempotency-Key support for sensitive POSTs (publishing). The first request with a key runs;
 * repeats with the same key + body replay the stored response; a different body is rejected.
 */
export async function withIdempotency(
  req: Request,
  workspaceId: string,
  route: string,
  body: unknown,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    const r = await run();
    return NextResponse.json(r.body, { status: r.status });
  }
  if (key.length > 200) throw badRequest("Idempotency-Key is too long");
  const hash = sha256(JSON.stringify(body ?? null));
  const [inserted] = await db.insert(idempotencyKeys).values({ workspaceId, key, route, requestHash: hash }).onConflictDoNothing().returning();
  if (!inserted) {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.route, route), eq(idempotencyKeys.key, key)));
    if (existing && existing.requestHash !== hash) throw conflict("This Idempotency-Key was already used with a different request.");
    if (!existing?.responseStatus) throw conflict("A request with this Idempotency-Key is still in progress.");
    return NextResponse.json(existing.responseBody, { status: existing.responseStatus, headers: { "Idempotent-Replay": "true" } });
  }
  try {
    const r = await run();
    await db.update(idempotencyKeys).set({ responseStatus: r.status, responseBody: r.body as object }).where(eq(idempotencyKeys.id, inserted.id));
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    // Let the client retry with the same key after a failure.
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, inserted.id));
    throw err;
  }
}

export async function purgeOldIdempotencyKeys() {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(Date.now() - 2 * 86400_000)));
}
