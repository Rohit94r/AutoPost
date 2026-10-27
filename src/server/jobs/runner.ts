import "server-only";
import { hostname } from "node:os";
import { and, asc, eq, isNotNull, lt } from "drizzle-orm";
import { collectAccountStats, collectDueMetrics } from "@/server/analytics/service";
import { db } from "@/server/db";
import { appState, publishingJobs, uploadedDocuments } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { engagement, maintainTokens, retention, scheduleReminders } from "@/server/maintenance";
import { dueJobsCondition } from "@/server/publishing/service";

/**
 * Background work without a worker process ("cron" mode, used on Vercel):
 * - urgent work (publish now, document extraction) runs right after the response (see ./after.ts);
 * - everything time-based runs from /api/cron/tick, which a scheduler calls every minute.
 * Publishing jobs are claimed atomically in Postgres, so overlapping runs never double-post.
 */

const MINUTE = 60_000;
const LAST_TICK = "scheduler:last-tick";

/** Periodic tasks and how often they run. */
const tasks = (): { name: string; every: number; run: () => Promise<unknown> }[] => [
  { name: "reminders", every: 5 * MINUTE, run: scheduleReminders },
  { name: "engagement", every: 5 * MINUTE, run: engagement },
  { name: "analytics", every: 30 * MINUTE, run: async () => ({ posts: await collectDueMetrics(), accounts: await collectAccountStats() }) },
  { name: "tokens", every: 60 * MINUTE, run: maintainTokens },
  { name: "retention", every: 6 * 60 * MINUTE, run: retention },
];

/** Atomically claim a periodic task: exactly one caller wins per period. */
export async function claimTask(name: string, everyMs: number, now = new Date()): Promise<boolean> {
  const key = `task:${name}`;
  await db.insert(appState).values({ key, updatedAt: new Date(0) }).onConflictDoNothing();
  // A few seconds of slack so a once-a-minute scheduler doesn't skip one-minute tasks on jitter.
  const claimed = await db
    .update(appState)
    .set({ updatedAt: now })
    .where(and(eq(appState.key, key), lt(appState.updatedAt, new Date(now.getTime() - everyMs + 5_000))))
    .returning({ key: appState.key });
  return claimed.length > 0;
}

/** Execute due publishing jobs until `deadline`, a few at a time. */
export async function runDueJobs(deadline: number, limit = 30) {
  const { executePublishingJob } = await import("@/server/publishing/executor");
  const due = await db.select({ id: publishingJobs.id }).from(publishingJobs).where(dueJobsCondition(new Date())).orderBy(asc(publishingJobs.scheduledAt)).limit(limit);
  const workerId = `cron:${hostname()}:${process.pid}`;
  const outcomes: Record<string, number> = {};
  const queue = [...due];
  const lane = async () => {
    while (queue.length && Date.now() < deadline) {
      const job = queue.shift()!;
      const r = await executePublishingJob(job.id, { workerId }).catch((err) => {
        logger.error({ err, jobId: job.id }, "publish job crashed");
        return { state: "crashed" as const };
      });
      outcomes[r.state] = (outcomes[r.state] ?? 0) + 1;
    }
  };
  await Promise.all([lane(), lane(), lane()]);
  return { due: due.length, ...outcomes };
}

/** Documents whose extraction was cut off (e.g. a timed-out function) are picked up again. */
async function resumeStuckDocuments(now: Date) {
  const { processDocument } = await import("@/server/documents/service");
  const stuck = await db
    .select({ id: uploadedDocuments.id, workspaceId: uploadedDocuments.workspaceId, userId: uploadedDocuments.uploadedBy })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.status, "processing"), isNotNull(uploadedDocuments.uploadedBy), lt(uploadedDocuments.updatedAt, new Date(now.getTime() - 10 * MINUTE))))
    .limit(2);
  for (const d of stuck) await processDocument({ documentId: d.id, workspaceId: d.workspaceId, userId: d.userId!, correlationId: `cron-resume-${d.id}` }).catch((err) => logger.warn({ err, documentId: d.id }, "document resume failed"));
  return stuck.length;
}

/** One scheduler run. Keeps within `budgetMs` so it ends before the host's function time limit. */
export async function tick(budgetMs = 240_000) {
  const now = new Date();
  const deadline = Date.now() + budgetMs;
  await db
    .insert(appState)
    .values({ key: LAST_TICK, value: { at: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({ target: appState.key, set: { value: { at: now.toISOString() }, updatedAt: now } });

  const { failStuckJobs } = await import("@/server/publishing/executor");
  const report: Record<string, unknown> = { stuck: await failStuckJobs() };
  // Publishing first (time-critical), keeping up to a minute (a quarter of the budget) for housekeeping.
  report.publish = await runDueJobs(deadline - Math.min(MINUTE, budgetMs / 4));
  report.documents = await resumeStuckDocuments(now);
  for (const t of tasks()) {
    if (Date.now() > deadline) break;
    if (!(await claimTask(t.name, t.every))) continue;
    try {
      report[t.name] = await t.run();
    } catch (err) {
      logger.error({ err, task: t.name }, "scheduled task failed");
      report[t.name] = { error: err instanceof Error ? err.message : "failed" };
    }
  }
  return report;
}

/** When the scheduler last called /api/cron/tick, or null if it never has. */
export async function lastTickAt(): Promise<Date | null> {
  const [row] = await db.select({ updatedAt: appState.updatedAt }).from(appState).where(eq(appState.key, LAST_TICK));
  return row?.updatedAt ?? null;
}
