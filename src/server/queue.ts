import "server-only";
import { Queue } from "bullmq";
import { backgroundMode } from "@/server/env";
import { runAfterResponse } from "@/server/jobs/after";
import { logger } from "@/server/logger";
import { getRedis } from "@/server/redis";

export const QUEUES = {
  publish: "flowt-publish",
  documents: "flowt-documents",
  analytics: "flowt-analytics",
  maintenance: "flowt-maintenance",
} as const;

export interface PublishJobData {
  publishingJobId: string;
  correlationId: string;
}
export interface DocumentJobData {
  documentId: string;
  workspaceId: string;
  userId: string;
  correlationId: string;
}

const g = globalThis as unknown as { __flowtQueues?: Map<string, Queue> };

function queue(name: string): Queue | null {
  const connection = getRedis();
  if (!connection) return null;
  g.__flowtQueues ??= new Map();
  let q = g.__flowtQueues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection,
      defaultJobOptions: { removeOnComplete: { age: 7 * 86400, count: 5000 }, removeOnFail: { age: 30 * 86400 } },
    });
    g.__flowtQueues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a publishing job. Postgres stays the source of truth: if Redis is unavailable the
 * worker's sweeper still picks up due jobs, so failures here are logged rather than surfaced.
 * The BullMQ job id embeds the scheduled timestamp so a reschedule produces a fresh delayed job
 * while duplicates of the same schedule are ignored.
 */
export async function enqueuePublish(data: PublishJobData, runAt: Date) {
  if (backgroundMode() === "cron") {
    // Due now: publish right after this response. Later: /api/cron/tick picks it up when due.
    if (runAt.getTime() > Date.now() + 5_000) return true;
    return runAfterResponse("publish", async () => {
      const { executePublishingJob } = await import("@/server/publishing/executor");
      await executePublishingJob(data.publishingJobId, { workerId: "inline" });
    });
  }
  const q = queue(QUEUES.publish);
  if (!q) {
    logger.warn({ jobId: data.publishingJobId }, "REDIS_URL not set; publish job will run when a worker sweeps");
    return false;
  }
  try {
    await q.add("publish", data, {
      jobId: `pub-${data.publishingJobId}-${runAt.getTime()}`,
      delay: Math.max(0, runAt.getTime() - Date.now()),
      attempts: 1, // retries are scheduled explicitly from Postgres state, not by BullMQ
    });
    return true;
  } catch (err) {
    logger.error({ err, jobId: data.publishingJobId }, "failed to enqueue publish job");
    return false;
  }
}

export async function enqueueDocument(data: DocumentJobData) {
  if (backgroundMode() === "cron") {
    return runAfterResponse("document", async () => {
      const { processDocument } = await import("@/server/documents/service");
      await processDocument(data);
    });
  }
  const q = queue(QUEUES.documents);
  if (!q) return false;
  await q.add("extract", data, { jobId: `doc-${data.documentId}-${Date.now()}`, attempts: 2, backoff: { type: "exponential", delay: 10_000 } });
  return true;
}

export async function queueCounts() {
  const result: Record<string, Record<string, number>> = {};
  for (const name of Object.values(QUEUES)) {
    const q = queue(name);
    if (!q) return null;
    result[name] = await q.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  }
  return result;
}
