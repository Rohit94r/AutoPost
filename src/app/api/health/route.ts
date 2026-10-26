import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getRedis } from "@/server/redis";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers. Reveals no configuration details. */
export async function GET() {
  const checks: Record<string, "ok" | "error" | "not_configured"> = {};
  try {
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  const redis = getRedis();
  if (!redis) checks.redis = "not_configured";
  else {
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }
  }
  const healthy = checks.database === "ok" && checks.redis !== "error";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks, time: new Date().toISOString() }, { status: healthy ? 200 : 503 });
}
