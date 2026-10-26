/**
 * Verdant background worker — a persistent Node process (never a serverless function).
 *
 *   publish      executes publishing jobs (delayed BullMQ jobs + sweeper recovery)
 *   documents    document extraction (PDF text / Gemini OCR / vision)
 *   maintenance  sweep (30s), reminders (5m), analytics (30m), tokens (1h), retention (6h)
 *
 * Postgres is the source of truth; BullMQ only provides timely delivery.
 */
process.env.VERDANT_SERVICE ??= "worker";

import { hostname } from "node:os";
import { Queue, Worker, type Job } from "bullmq";
import { collectDueMetrics } from "@/server/analytics/service";
import { closeDb } from "@/server/db";
import { processDocument } from "@/server/documents/service";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { maintainTokens, retention, scheduleReminders, sweep } from "@/server/maintenance";
import { executePublishingJob } from "@/server/publishing/executor";
import { QUEUES, type DocumentJobData, type PublishJobData } from "@/server/queue";
import { newRedisConnection } from "@/server/redis";

const workerId = `${hostname()}:${process.pid}`;
const shutdown = new AbortController();

async function main() {
  env(); // validate configuration up-front
  const connection = newRedisConnection();
  logger.info({ workerId }, "worker starting");

  const publishWorker = new Worker<PublishJobData>(
    QUEUES.publish,
    async (job: Job<PublishJobData>) => {
      const result = await executePublishingJob(job.data.publishingJobId, { workerId, signal: shutdown.signal });
      logger.info({ jobId: job.data.publishingJobId, correlationId: job.data.correlationId, state: result.state }, "publish job handled");
      return result;
    },
    { connection, concurrency: Number(process.env.PUBLISH_CONCURRENCY ?? 5), lockDuration: 10 * 60_000 },
  );

  const documentWorker = new Worker<DocumentJobData>(
    QUEUES.documents,
    async (job) => processDocument(job.data),
    { connection: newRedisConnection(), concurrency: Number(process.env.DOCUMENT_CONCURRENCY ?? 2), lockDuration: 5 * 60_000 },
  );

  const maintenanceQueue = new Queue(QUEUES.maintenance, { connection: newRedisConnection() });
  const schedules: [string, number][] = [
    ["sweep", 30_000],
    ["reminders", 5 * 60_000],
    ["analytics", 30 * 60_000],
    ["tokens", 60 * 60_000],
    ["retention", 6 * 60 * 60_000],
  ];
  for (const [name, every] of schedules) {
    await maintenanceQueue.upsertJobScheduler(name, { every }, { name, opts: { removeOnComplete: 100, removeOnFail: 100 } });
  }
  const maintenanceWorker = new Worker(
    QUEUES.maintenance,
    async (job) => {
      switch (job.name) {
        case "sweep":
          return sweep();
        case "reminders":
          return scheduleReminders();
        case "analytics":
          return collectDueMetrics();
        case "tokens":
          return maintainTokens();
        case "retention":
          return retention();
      }
    },
    { connection: newRedisConnection(), concurrency: 1 },
  );

  for (const w of [publishWorker, documentWorker, maintenanceWorker]) {
    w.on("failed", (job, err) => logger.error({ err, queue: w.name, jobId: job?.id }, "job failed"));
    w.on("error", (err) => logger.error({ err, queue: w.name }, "worker error"));
  }

  // Recover anything that became due while no worker was running.
  await sweep().catch((err) => logger.error({ err }, "startup sweep failed"));
  logger.info("worker ready");

  const stop = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    shutdown.abort();
    const timeout = setTimeout(() => process.exit(1), 30_000);
    await Promise.allSettled([publishWorker.close(), documentWorker.close(), maintenanceWorker.close(), maintenanceQueue.close()]);
    await closeDb();
    connection.disconnect();
    clearTimeout(timeout);
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
