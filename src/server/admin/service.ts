import "server-only";
import { desc, gte, inArray, sql } from "drizzle-orm";
import { getRegistry } from "@/server/ai/registry";
import { db } from "@/server/db";
import { aiGenerations, publishingJobs, users, workspaces } from "@/server/db/schema";
import { env, integrationStatus } from "@/server/env";
import { forbidden } from "@/server/errors";
import { queueCounts } from "@/server/queue";

export function isAdmin(email: string | null | undefined) {
  return Boolean(email && env().ADMIN_EMAILS.includes(email.toLowerCase()));
}

export function assertAdmin(email: string | null | undefined) {
  if (!isAdmin(email)) throw forbidden("Admin access required");
}

/** Operational overview across all tenants (admins only; no content or tokens exposed). */
export async function adminOverview() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [userCount, wsCount, jobStatus, recentFailures, aiStats, queues] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(workspaces),
    db.select({ status: publishingJobs.status, n: sql<number>`count(*)::int` }).from(publishingJobs).groupBy(publishingJobs.status),
    db
      .select({ id: publishingJobs.id, platform: publishingJobs.platform, code: publishingJobs.lastErrorCode, message: publishingJobs.lastErrorMessage, updatedAt: publishingJobs.updatedAt, correlationId: publishingJobs.correlationId })
      .from(publishingJobs)
      .where(inArray(publishingJobs.status, ["failed", "needs_reconnection"]))
      .orderBy(desc(publishingJobs.updatedAt))
      .limit(20),
    db
      .select({ provider: aiGenerations.provider, status: aiGenerations.status, n: sql<number>`count(*)::int`, avgLatency: sql<number>`coalesce(avg(${aiGenerations.latencyMs}),0)::int` })
      .from(aiGenerations)
      .where(gte(aiGenerations.createdAt, since))
      .groupBy(aiGenerations.provider, aiGenerations.status),
    queueCounts().catch(() => null),
  ]);
  return {
    users: userCount[0]?.n ?? 0,
    workspaces: wsCount[0]?.n ?? 0,
    jobs: jobStatus,
    recentFailures,
    ai24h: aiStats,
    queues,
    integrations: integrationStatus(),
    ai: getRegistry().status(),
  };
}
