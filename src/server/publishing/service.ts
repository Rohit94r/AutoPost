import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { composeFinalText, PLATFORMS, validateMedia, validateText, type ValidationIssue } from "@/lib/platforms";
import { zonedLocalToUtc } from "@/lib/time";
import { audit } from "@/server/audit";
import { refreshContentStatus } from "@/server/content/service";
import { db } from "@/server/db";
import { contentItems, contentMedia, contentVariants, mediaAssets, publishingAttempts, publishingJobs, socialAccounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError, badRequest, conflict, notFound } from "@/server/errors";
import { enqueuePublish } from "@/server/queue";
import { assertQuota, recordUsage } from "@/server/usage/service";
import { isSafeToRetry } from "./retry";

export const createJobsInput = z.object({
  contentId: z.string().uuid(),
  targets: z.array(z.object({ socialAccountId: z.string().uuid() })).min(1).max(20),
  mode: z.enum(["now", "schedule"]),
  scheduledAtLocal: z.string().optional(),
  timezone: z.string().max(64).default("UTC"),
});

const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 366 * 86400_000;

function resolveSchedule(input: z.infer<typeof createJobsInput>, now: Date) {
  if (input.mode === "now") return now;
  if (!input.scheduledAtLocal) throw badRequest("Pick a date and time to schedule.");
  let at: Date;
  try {
    at = zonedLocalToUtc(input.scheduledAtLocal, input.timezone);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) throw badRequest("Scheduled time must be at least 1 minute in the future.");
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) throw badRequest("You can schedule up to one year ahead.");
  return at;
}

/** Validate every destination before creating anything (all-or-nothing). */
export async function preflight(workspaceId: string, contentId: string, accountIds: string[]) {
  const [content] = await db.select().from(contentItems).where(and(eq(contentItems.id, contentId), eq(contentItems.workspaceId, workspaceId)));
  if (!content) throw notFound("Post");
  if (content.archivedAt) throw badRequest("Archived posts can't be published.");
  const [variants, accounts, media] = await Promise.all([
    db.select().from(contentVariants).where(eq(contentVariants.contentId, contentId)),
    db.select().from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), inArray(socialAccounts.id, accountIds))),
    db
      .select({ kind: mediaAssets.kind, mimeType: mediaAssets.mimeType, id: mediaAssets.id })
      .from(contentMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, contentMedia.mediaId))
      .where(eq(contentMedia.contentId, contentId)),
  ]);
  if (accounts.length !== new Set(accountIds).size) throw badRequest("One or more selected accounts don't belong to this workspace.");

  const problems: { accountId: string; platform: string; issues: ValidationIssue[] }[] = [];
  const plan = accounts.map((account) => {
    const variant = variants.find((v) => v.platform === account.platform);
    const issues: ValidationIssue[] = [];
    if (account.status !== "connected") {
      issues.push({
        level: "error",
        code: `account_${account.status}`,
        message:
          account.status === "permission_required"
            ? `${account.displayName}: ${account.lastError ?? "required permissions are missing"}.`
            : `${account.displayName} is ${account.status}. Reconnect it first.`,
      });
    }
    if (!variant) {
      issues.push({ level: "error", code: "no_variant", message: `There is no ${account.platform} version of this post.` });
    } else {
      const m = variant.includeMedia ? media : [];
      const text = composeFinalText(variant.body, variant.hashtags);
      issues.push(...validateText(account.platform, text, { mediaCount: m.length, xMaxLength: env().X_MAX_POST_LENGTH }), ...validateMedia(account.platform, m));
    }
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length) problems.push({ accountId: account.id, platform: account.platform, issues: errors });
    return { account, variant };
  });
  if (problems.length) throw new AppError(422, "preflight_failed", "Some destinations aren't ready to publish.", { problems });
  return { content, plan };
}

export async function createPublishingJobs(
  ctx: { workspaceId: string; userId: string; correlationId: string; req?: Request },
  input: z.infer<typeof createJobsInput>,
  now = new Date(),
) {
  const scheduledAt = resolveSchedule(input, now);
  const ids = input.targets.map((t) => t.socialAccountId);
  const { plan } = await preflight(ctx.workspaceId, input.contentId, ids);
  await assertQuota(ctx.workspaceId, "publishing", plan.length);

  const status = input.mode === "now" ? ("queued" as const) : ("scheduled" as const);
  const result = await db.transaction(async (tx) => {
    const created: (typeof publishingJobs.$inferSelect)[] = [];
    const skipped: { socialAccountId: string; reason: string }[] = [];
    for (const { account, variant } of plan) {
      const [job] = await tx
        .insert(publishingJobs)
        .values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          contentId: input.contentId,
          variantId: variant!.id,
          socialAccountId: account.id,
          platform: account.platform,
          scheduledAt,
          timezone: input.timezone,
          status,
          correlationId: ctx.correlationId,
        })
        .onConflictDoNothing()
        .returning();
      if (job) created.push(job);
      else skipped.push({ socialAccountId: account.id, reason: "Already scheduled or published to this account." });
    }
    if (created.length) {
      await recordUsage({ workspaceId: ctx.workspaceId, userId: ctx.userId, metric: "publishing_job", quantity: created.length }, tx);
      await tx.update(contentItems).set({ timezone: input.timezone }).where(eq(contentItems.id, input.contentId));
      await refreshContentStatus(input.contentId, tx);
      await audit(
        { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: input.mode === "now" ? "publishing.requested" : "publishing.scheduled", targetType: "content", targetId: input.contentId, metadata: { jobs: created.map((j) => j.id), scheduledAt: scheduledAt.toISOString(), timezone: input.timezone }, req: ctx.req, correlationId: ctx.correlationId },
        tx,
      );
    }
    return { created, skipped };
  });

  for (const job of result.created) await enqueuePublish({ publishingJobId: job.id, correlationId: ctx.correlationId }, job.scheduledAt);
  return { jobs: result.created.map(serializeJob), skipped: result.skipped };
}

export function serializeJob(j: typeof publishingJobs.$inferSelect) {
  const { payloadSnapshot: _p, lockedBy: _l, ...rest } = j;
  return rest;
}

async function loadJob(workspaceId: string, id: string) {
  const [job] = await db.select().from(publishingJobs).where(and(eq(publishingJobs.id, id), eq(publishingJobs.workspaceId, workspaceId)));
  if (!job) throw notFound("Publishing job");
  return job;
}

/** Cancel only succeeds while the job hasn't started; the conditional update makes this race-free. */
export async function cancelJob(ctx: { workspaceId: string; userId: string; req?: Request }, id: string) {
  const [updated] = await db
    .update(publishingJobs)
    .set({ status: "cancelled", cancelledAt: new Date(), nextRetryAt: null })
    .where(and(eq(publishingJobs.id, id), eq(publishingJobs.workspaceId, ctx.workspaceId), inArray(publishingJobs.status, ["queued", "scheduled", "needs_reconnection", "draft"])))
    .returning();
  if (!updated) {
    const job = await loadJob(ctx.workspaceId, id);
    if (job.status === "processing") throw conflict("Publishing has already started for this destination and can't be cancelled.");
    if (job.status === "published") throw conflict("This destination is already published. Delete the post on the platform if needed.");
    throw conflict(`This job is ${job.status} and can't be cancelled.`);
  }
  await refreshContentStatus(updated.contentId);
  await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "publishing.cancelled", targetType: "publishing_job", targetId: id, req: ctx.req });
  return serializeJob(updated);
}

export async function rescheduleJob(ctx: { workspaceId: string; userId: string; correlationId: string }, id: string, input: { scheduledAtLocal: string; timezone: string }, now = new Date()) {
  const at = resolveSchedule({ mode: "schedule", scheduledAtLocal: input.scheduledAtLocal, timezone: input.timezone, contentId: id, targets: [{ socialAccountId: id }] }, now);
  const [updated] = await db
    .update(publishingJobs)
    .set({ scheduledAt: at, timezone: input.timezone, nextRetryAt: null })
    .where(and(eq(publishingJobs.id, id), eq(publishingJobs.workspaceId, ctx.workspaceId), eq(publishingJobs.status, "scheduled")))
    .returning();
  if (!updated) throw conflict("Only scheduled (not yet started) destinations can be rescheduled.");
  await refreshContentStatus(updated.contentId);
  // The previously-delayed BullMQ job will fire at the old time and be skipped by the executor's
  // claim condition (scheduled_at <= now), so no duplicate is possible.
  await enqueuePublish({ publishingJobId: updated.id, correlationId: ctx.correlationId }, at);
  await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "publishing.rescheduled", targetType: "publishing_job", targetId: id, metadata: { scheduledAt: at.toISOString() } });
  return serializeJob(updated);
}

/** Re-queue a failed destination. Ambiguous failures require the user to confirm they checked the platform. */
export async function retryJob(ctx: { workspaceId: string; userId: string; correlationId: string }, id: string, opts: { confirmNotPublished?: boolean } = {}) {
  const job = await loadJob(ctx.workspaceId, id);
  if (job.status !== "failed" && job.status !== "needs_reconnection") throw conflict(`Only failed destinations can be retried (this one is ${job.status}).`);
  if (!isSafeToRetry(job.lastErrorCode) && !opts.confirmNotPublished) {
    throw new AppError(409, "confirm_required", "We couldn't confirm whether this post was published. Check your profile, then confirm to retry.", { requiresConfirmation: true });
  }
  if (job.status === "needs_reconnection") {
    const [acct] = await db.select({ status: socialAccounts.status }).from(socialAccounts).where(eq(socialAccounts.id, job.socialAccountId));
    if (acct?.status !== "connected") throw conflict("Reconnect the account before retrying.");
  }
  const now = new Date();
  try {
    const [updated] = await db
      .update(publishingJobs)
      .set({ status: "queued", nextRetryAt: null, scheduledAt: now, maxAttempts: job.attemptCount + 5, lastErrorCode: null, lastErrorMessage: null, completedAt: null })
      .where(and(eq(publishingJobs.id, id), inArray(publishingJobs.status, ["failed", "needs_reconnection"])))
      .returning();
    if (!updated) throw conflict("This job changed state. Refresh and try again.");
    await refreshContentStatus(updated.contentId);
    await enqueuePublish({ publishingJobId: updated.id, correlationId: ctx.correlationId }, now);
    await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "publishing.retried", targetType: "publishing_job", targetId: id, metadata: { confirmed: Boolean(opts.confirmNotPublished) } });
    return serializeJob(updated);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw conflict("Another job for this destination is already active or published.");
    throw err;
  }
}

/** Retry every safely-retryable failed destination of a post (partial-success recovery). */
export async function retryFailedForContent(ctx: { workspaceId: string; userId: string; correlationId: string }, contentId: string) {
  const failed = await db
    .select()
    .from(publishingJobs)
    .where(and(eq(publishingJobs.contentId, contentId), eq(publishingJobs.workspaceId, ctx.workspaceId), eq(publishingJobs.status, "failed")));
  const retried: string[] = [];
  const needsConfirmation: string[] = [];
  for (const j of failed) {
    if (!isSafeToRetry(j.lastErrorCode)) {
      needsConfirmation.push(j.id);
      continue;
    }
    if (j.lastErrorCode === "validation" || j.lastErrorCode === "permission" || j.lastErrorCode === "media") continue;
    await retryJob(ctx, j.id);
    retried.push(j.id);
  }
  return { retried, needsConfirmation };
}

export const listJobsQuery = z.object({
  status: z.string().optional(),
  platform: z.enum(PLATFORMS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  order: z.enum(["asc", "desc"]).default("asc"),
});

const JOB_STATUSES = ["draft", "queued", "scheduled", "processing", "published", "failed", "cancelled", "needs_reconnection"] as const;

export async function listJobs(workspaceId: string, q: z.infer<typeof listJobsQuery>) {
  const statuses = (q.status?.split(",") ?? []).filter((s): s is (typeof JOB_STATUSES)[number] => (JOB_STATUSES as readonly string[]).includes(s));
  const conds: (SQL | undefined)[] = [eq(publishingJobs.workspaceId, workspaceId)];
  if (statuses.length) conds.push(inArray(publishingJobs.status, statuses));
  if (q.platform) conds.push(eq(publishingJobs.platform, q.platform));
  if (q.from) conds.push(gte(publishingJobs.scheduledAt, new Date(q.from)));
  if (q.to) conds.push(lte(publishingJobs.scheduledAt, new Date(q.to)));
  const where = and(...conds);
  const order = q.order === "asc" ? asc(publishingJobs.scheduledAt) : desc(publishingJobs.updatedAt);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        job: publishingJobs,
        content: { id: contentItems.id, title: contentItems.title },
        variantBody: contentVariants.body,
        account: { id: socialAccounts.id, displayName: socialAccounts.displayName, username: socialAccounts.username, avatarUrl: socialAccounts.avatarUrl },
      })
      .from(publishingJobs)
      .innerJoin(contentItems, eq(contentItems.id, publishingJobs.contentId))
      .innerJoin(contentVariants, eq(contentVariants.id, publishingJobs.variantId))
      .innerJoin(socialAccounts, eq(socialAccounts.id, publishingJobs.socialAccountId))
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(publishingJobs).where(where),
  ]);
  return {
    items: rows.map((r) => ({ ...serializeJob(r.job), content: r.content, preview: r.variantBody.slice(0, 280), account: r.account })),
    total: total?.n ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function jobAttempts(workspaceId: string, jobId: string) {
  await loadJob(workspaceId, jobId);
  return db.select().from(publishingAttempts).where(eq(publishingAttempts.jobId, jobId)).orderBy(asc(publishingAttempts.attemptNumber));
}

export const statusCounts = (workspaceId: string) =>
  db
    .select({ status: publishingJobs.status, n: count() })
    .from(publishingJobs)
    .where(eq(publishingJobs.workspaceId, workspaceId))
    .groupBy(publishingJobs.status);

/** A job is due when it's waiting, its time has come, and any retry delay has elapsed (5s clock-skew grace). */
export const dueJobsCondition = (now: Date) => {
  const edge = new Date(now.getTime() + 5_000);
  return and(
    inArray(publishingJobs.status, ["queued", "scheduled"]),
    lte(publishingJobs.scheduledAt, edge),
    or(isNull(publishingJobs.nextRetryAt), lte(publishingJobs.nextRetryAt, edge)),
  );
};
