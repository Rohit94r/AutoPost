import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { tick } from "@/server/jobs/runner";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
// Vercel Hobby and Pro both allow 300 s with fluid compute; tick() stops itself after ~4 minutes.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return env().NODE_ENV !== "production"; // local development only
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduler entry point (cron mode). Vercel Cron calls it with GET and sends
 * "Authorization: Bearer $CRON_SECRET"; external schedulers (cron-job.org, Upstash QStash)
 * must send the same header. Publishes due posts, then runs housekeeping.
 */
async function handle(req: Request) {
  if (!env().CRON_SECRET && env().NODE_ENV === "production") {
    return NextResponse.json({ error: { code: "not_configured", message: "Set CRON_SECRET to enable the scheduler." } }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ error: { code: "unauthorized", message: "Invalid scheduler secret." } }, { status: 401 });
  const started = Date.now();
  const report = await tick();
  logger.info({ report, ms: Date.now() - started }, "scheduler tick");
  return NextResponse.json({ ok: true, ms: Date.now() - started, report });
}

export const GET = handle;
export const POST = handle;
