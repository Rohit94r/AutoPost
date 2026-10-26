import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { finalPostText, PLATFORM_META } from "@/lib/platforms";
import { refreshContentStatus } from "@/server/content/service";
import { db } from "@/server/db";
import { contentItems, contentMedia, contentVariants, mediaAssets, publishedPosts, publishingAttempts, publishingJobs, socialAccounts } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { prepareMedia } from "@/server/media/service";
import { notify } from "@/server/notifications/service";
import { getAccessToken, markAccount } from "@/server/oauth/service";
import { getAdapter } from "@/server/platforms/registry";
import { PlatformError } from "@/server/platforms/types";
import { enqueuePublish } from "@/server/queue";
import { decideOutcome } from "./retry";
import { dueJobsCondition } from "./service";

export interface ExecuteOptions {
  workerId: string;
  signal?: AbortSignal;
  now?: () => Date;
}

export type ExecuteResult =
  | { state: "skipped" }
  | { state: "published"; externalPostId: string; url: string | null }
  | { state: "retry_scheduled"; retryAt: Date }
  | { state: "failed" | "needs_reconnection"; code: string; message: string };

/**
 * Atomically claim a due job. Only one worker can win; cancelled, rescheduled-to-later,
 * already-processing or published jobs are never claimed.
 */
export async function claimJob(jobId: string, workerId: string, now: Date) {
  const [job] = await db
    .update(publishingJobs)
    .set({
      status: "processing",
      lockedAt: now,
      lockedBy: workerId,
      startedAt: sql`coalesce(${publishingJobs.startedAt}, ${now.toISOString()}::timestamptz)`,
      attemptCount: sql`${publishingJobs.attemptCount} + 1`,
      nextRetryAt: null,
    })
    .where(and(eq(publishingJobs.id, jobId), dueJobsCondition(now)))
    .returning();
  return job ?? null;
}

export async function executePublishingJob(jobId: string, opts: ExecuteOptions): Promise<ExecuteResult> {
  const now = opts.now ?? (() => new Date());
  const job = await claimJob(jobId, opts.workerId, now());
  if (!job) return { state: "skipped" };

  const log = logger.child({ jobId, correlationId: job.correlationId, platform: job.platform, attempt: job.attemptCount });
  const started = Date.now();
  const [attempt] = await db
    .insert(publishingAttempts)
    .values({ jobId, attemptNumber: job.attemptCount, startedAt: now() })
    .returning({ id: publishingAttempts.id });

  const [account] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, job.socialAccountId), eq(socialAccounts.workspaceId, job.workspaceId)));
  const [variant] = await db.select().from(contentVariants).where(eq(contentVariants.id, job.variantId));
  const [content] = await db.select().from(contentItems).where(eq(contentItems.id, job.contentId));

  try {
    if (!account || !variant || !content) throw new PlatformError("validation", "The post or account no longer exists.");
    if (account.status === "disconnected" || account.status === "expired") throw new PlatformError("auth", `${account.displayName} needs to be reconnected.`);
    if (account.status === "permission_required") throw new PlatformError("permission", account.lastError ?? "Required permissions are missing.");

    const mediaRows = variant.includeMedia
      ? (
          await db
            .select({ media: mediaAssets })
            .from(contentMedia)
            .innerJoin(mediaAssets, eq(mediaAssets.id, contentMedia.mediaId))
            .where(eq(contentMedia.contentId, content.id))
            .orderBy(asc(contentMedia.position))
        ).map((r) => r.media)
      : [];
    if (mediaRows.some((m) => m.deletedAt)) throw new PlatformError("validation", "An attached media file was deleted.");

    const text = finalPostText(job.platform, variant.body, variant.hashtags, content.linkUrl);

    // Freeze exactly what we're about to send (audit / history).
    await db.update(publishingJobs).set({ payloadSnapshot: { text, mediaIds: mediaRows.map((m) => m.id), linkUrl: content.linkUrl } }).where(eq(publishingJobs.id, jobId));

    const accessToken = await getAccessToken(account);
    const result = await getAdapter(job.platform).publish({
      accessToken,
      account: { externalAccountId: account.externalAccountId, accountType: account.accountType, username: account.username, metadata: account.metadata },
      text,
      media: mediaRows.map((m) => prepareMedia(m, job.platform)),
      title: content.title,
      linkUrl: content.linkUrl,
      idempotencyKey: job.id,
      signal: opts.signal,
    });

    // Success is recorded only after the platform confirmed and returned an id.
    await db.transaction(async (tx) => {
      const completedAt = now();
      await tx
        .update(publishingJobs)
        .set({ status: "published", externalPostId: result.externalPostId, publishedUrl: result.url, completedAt, lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null })
        .where(eq(publishingJobs.id, jobId));
      await tx
        .insert(publishedPosts)
        .values({ jobId, workspaceId: job.workspaceId, contentId: job.contentId, socialAccountId: account.id, platform: job.platform, externalPostId: result.externalPostId, url: result.url, publishedAt: completedAt })
        .onConflictDoNothing();
      await tx
        .update(publishingAttempts)
        .set({ finishedAt: completedAt, outcome: "success", platformRequestId: result.platformRequestId ?? null, durationMs: Date.now() - started })
        .where(eq(publishingAttempts.id, attempt!.id));
    });
    log.info({ externalPostId: result.externalPostId }, "published");
    await afterOutcome(job.contentId, job.workspaceId, content.title);
    return { state: "published", externalPostId: result.externalPostId, url: result.url };
  } catch (err) {
    const decision = decideOutcome(err, job.attemptCount, job.maxAttempts, now());
    const pe = err instanceof PlatformError ? err : null;
    log.warn({ code: decision.code, status: decision.status, err: pe ? undefined : err }, "publish attempt failed");
    await db.transaction(async (tx) => {
      await tx
        .update(publishingAttempts)
        .set({ finishedAt: now(), outcome: decision.attemptOutcome, errorCode: decision.code, errorMessage: decision.message.slice(0, 1000), httpStatus: pe?.opts.status ?? null, platformRequestId: pe?.opts.requestId ?? null, durationMs: Date.now() - started })
        .where(eq(publishingAttempts.id, attempt!.id));
      await tx
        .update(publishingJobs)
        .set({
          status: decision.status,
          nextRetryAt: decision.status === "queued" ? decision.retryAt : null,
          lastErrorCode: decision.code,
          lastErrorMessage: decision.message.slice(0, 1000),
          lockedAt: null,
          lockedBy: null,
          completedAt: decision.status === "queued" ? null : now(),
        })
        .where(eq(publishingJobs.id, jobId));
    });
    if (decision.status === "needs_reconnection" && account) {
      await markAccount(account.id, "expired", decision.message);
      await notify({ workspaceId: job.workspaceId, type: "account_reconnect", severity: "warning", title: `Reconnect ${account.displayName}`, body: decision.message, link: "/accounts", dedupeKey: `reconnect:${account.id}:${new Date().toISOString().slice(0, 10)}` });
    }
    if (decision.status === "failed" && decision.code === "permission" && account) {
      await markAccount(account.id, "permission_required", decision.message);
    }
    if (decision.status === "queued") {
      await enqueuePublish({ publishingJobId: jobId, correlationId: job.correlationId }, decision.retryAt);
      await refreshContentStatus(job.contentId);
      return { state: "retry_scheduled", retryAt: decision.retryAt };
    }
    await afterOutcome(job.contentId, job.workspaceId, content?.title ?? "Post");
    return { state: decision.status, code: decision.code, message: decision.message };
  }
}

/** Roll up content status; when every destination has finished, send one summary notification. */
async function afterOutcome(contentId: string, workspaceId: string, title: string) {
  const status = await refreshContentStatus(contentId);
  if (status !== "published" && status !== "partially_published" && status !== "failed") return;
  const jobs = await db
    .select({ id: publishingJobs.id, platform: publishingJobs.platform, status: publishingJobs.status })
    .from(publishingJobs)
    .where(eq(publishingJobs.contentId, contentId));
  const ok = jobs.filter((j) => j.status === "published").map((j) => PLATFORM_META[j.platform].label);
  const bad = jobs.filter((j) => j.status === "failed" || j.status === "needs_reconnection").map((j) => PLATFORM_META[j.platform].label);
  const key = `content:${contentId}:${status}:${jobs.map((j) => j.status).join(",")}`;
  if (status === "published") {
    await notify({ workspaceId, type: "publish_succeeded", severity: "success", title: `Published: ${title}`, body: `Live on ${ok.join(", ")}.`, link: `/history?content=${contentId}`, dedupeKey: key });
  } else if (status === "partially_published") {
    await notify({ workspaceId, type: "publish_partial", severity: "warning", title: `Partially published: ${title}`, body: `Live on ${ok.join(", ")}. Failed on ${bad.join(", ")}.`, link: `/history?content=${contentId}`, dedupeKey: key });
  } else {
    await notify({ workspaceId, type: "publish_failed", severity: "error", title: `Publishing failed: ${title}`, body: `Failed on ${bad.join(", ")}. Open history for details.`, link: `/history?content=${contentId}`, dedupeKey: key });
  }
}

/** Sweeper: find due jobs in Postgres and (re-)enqueue them — recovers from worker restarts / Redis loss. */
export async function recoverDueJobs(now = new Date(), limit = 200) {
  const due = await db
    .select({ id: publishingJobs.id, correlationId: publishingJobs.correlationId })
    .from(publishingJobs)
    .where(dueJobsCondition(now))
    .orderBy(asc(publishingJobs.scheduledAt))
    .limit(limit);
  for (const j of due) await enqueuePublish({ publishingJobId: j.id, correlationId: j.correlationId }, now);
  return due.length;
}

/**
 * Jobs stuck in `processing` (worker crashed mid-publish) are failed as "interrupted" rather than
 * retried: the platform may already have created the post, so a human must check first.
 */
export async function failStuckJobs(now = new Date(), staleMs = 15 * 60_000) {
  const stuck = await db
    .update(publishingJobs)
    .set({
      status: "failed",
      lockedAt: null,
      lockedBy: null,
      completedAt: now,
      lastErrorCode: "interrupted",
      lastErrorMessage: "Publishing was interrupted (worker restart). Check the platform to see whether the post went live before retrying.",
    })
    .where(and(eq(publishingJobs.status, "processing"), lt(publishingJobs.lockedAt, new Date(now.getTime() - staleMs))))
    .returning({ id: publishingJobs.id, contentId: publishingJobs.contentId, workspaceId: publishingJobs.workspaceId, attemptCount: publishingJobs.attemptCount });
  for (const j of stuck) {
    await db
      .update(publishingAttempts)
      .set({ finishedAt: now, outcome: "interrupted", errorCode: "interrupted" })
      .where(and(eq(publishingAttempts.jobId, j.id), eq(publishingAttempts.attemptNumber, j.attemptCount)));
    const [c] = await db.select({ title: contentItems.title }).from(contentItems).where(eq(contentItems.id, j.contentId));
    await afterOutcome(j.contentId, j.workspaceId, c?.title ?? "Post");
  }
  return stuck.length;
}

export async function countByStatus(statuses: (typeof publishingJobs.$inferSelect)["status"][]) {
  return db.select({ status: publishingJobs.status, n: sql<number>`count(*)::int` }).from(publishingJobs).where(inArray(publishingJobs.status, statuses)).groupBy(publishingJobs.status);
}
