import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createContent, getContent } from "@/server/content/service";
import type { Database } from "@/server/db";
import { contentItems, publishedPosts, publishingAttempts, publishingJobs, socialAccounts } from "@/server/db/schema";
import { claimJob, executePublishingJob, failStuckJobs, recoverDueJobs } from "@/server/publishing/executor";
import { setAdaptersForTesting } from "@/server/platforms/registry";
import { PlatformError, type PlatformAdapter, type PublishInput } from "@/server/platforms/types";
import { cancelJob, createPublishingJobs, rescheduleJob, retryFailedForContent, retryJob } from "@/server/publishing/service";
import { createTestDb, seedAccount, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => t.close());
afterEach(() => setAdaptersForTesting(undefined));

function fakeAdapter(platform: "linkedin" | "instagram" | "x", publish: (i: PublishInput) => Promise<{ externalPostId: string; url: string | null }>): PlatformAdapter {
  return {
    platform,
    usesPkce: false,
    isConfigured: () => true,
    requestedScopes: () => [],
    requiredPublishScopes: () => [],
    buildAuthorizeUrl: () => "",
    exchangeCode: async () => ({ accessToken: "", scopes: [] }),
    canRefresh: () => false,
    refresh: async () => ({ accessToken: "", scopes: [] }),
    fetchAccounts: async () => [],
    revoke: async () => ({ revoked: false }),
    publish,
    fetchMetrics: async () => [],
  };
}

async function setup(platforms: ("linkedin" | "x")[] = ["linkedin", "x"]) {
  const { userId, workspaceId } = await seedUserWorkspace(db);
  const accounts = [];
  for (const p of platforms) accounts.push(await seedAccount(db, workspaceId, p));
  const content = await createContent(
    { workspaceId, userId },
    {
      title: "Launch",
      body: "We launched",
      hashtags: [],
      tags: [],
      aiGenerated: false,
      isTemplate: false,
      mediaIds: [],
      variants: platforms.map((p) => ({ platform: p, body: `Hello ${p}`, hashtags: ["launch"], includeMedia: true, aiGenerated: false })),
    },
  );
  const ctx = { workspaceId, userId, correlationId: crypto.randomUUID() };
  return { ctx, accounts, content };
}

const opts = { workerId: "test-worker" };

describe("publishing engine", () => {
  it("publishes now, records the platform id and rolls up status", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    let sent = "";
    setAdaptersForTesting({ linkedin: fakeAdapter("linkedin", async (i) => ((sent = i.text), { externalPostId: "urn:li:share:1", url: "https://li/1" })) });
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now", timezone: "UTC" });
    expect(jobs).toHaveLength(1);
    const res = await executePublishingJob(jobs[0]!.id, opts);
    expect(res).toMatchObject({ state: "published", externalPostId: "urn:li:share:1" });
    expect(sent).toBe("Hello linkedin\n\n#launch");
    const [job] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, jobs[0]!.id));
    expect(job).toMatchObject({ status: "published", attemptCount: 1, publishedUrl: "https://li/1" });
    expect(await db.select().from(publishedPosts).where(eq(publishedPosts.jobId, job!.id))).toHaveLength(1);
    expect((await getContent(ctx.workspaceId, content.id)).status).toBe("published");
    // A second execution of the same job is a no-op.
    expect(await executePublishingJob(job!.id, opts)).toEqual({ state: "skipped" });
  });

  it("prevents duplicate jobs for the same destination", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    const input = { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now" as const, timezone: "UTC" };
    const first = await createPublishingJobs(ctx, input);
    const second = await createPublishingJobs(ctx, input);
    expect(first.jobs).toHaveLength(1);
    expect(second.jobs).toHaveLength(0);
    expect(second.skipped[0]!.reason).toMatch(/Already/);
  });

  it("handles partial success and only retries safe failures", async () => {
    const { ctx, accounts, content } = await setup(["linkedin", "x"]);
    setAdaptersForTesting({
      linkedin: fakeAdapter("linkedin", async () => ({ externalPostId: "urn:li:share:2", url: null })),
      x: fakeAdapter("x", async () => {
        throw new PlatformError("validation", "Text rejected");
      }),
    });
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: accounts.map((a) => ({ socialAccountId: a.id })), mode: "now", timezone: "UTC" });
    for (const j of jobs) await executePublishingJob(j.id, opts);
    expect((await getContent(ctx.workspaceId, content.id)).status).toBe("partially_published");
    const r = await retryFailedForContent(ctx, content.id);
    expect(r.retried).toHaveLength(0); // validation errors are permanent
    const li = jobs.find((j) => j.platform === "linkedin")!;
    await expect(retryJob(ctx, li.id)).rejects.toMatchObject({ status: 409 }); // published can't be retried
  });

  it("schedules transient failures with backoff and respects next_retry_at", async () => {
    const { ctx, accounts, content } = await setup(["x"]);
    let calls = 0;
    setAdaptersForTesting({
      x: fakeAdapter("x", async () => {
        calls++;
        if (calls === 1) throw new PlatformError("transient", "503");
        return { externalPostId: "99", url: null };
      }),
    });
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now", timezone: "UTC" });
    const first = await executePublishingJob(jobs[0]!.id, opts);
    expect(first.state).toBe("retry_scheduled");
    expect(await executePublishingJob(jobs[0]!.id, opts)).toEqual({ state: "skipped" }); // not due yet
    const later = first.state === "retry_scheduled" ? new Date(first.retryAt.getTime() + 1000) : new Date();
    const second = await executePublishingJob(jobs[0]!.id, { ...opts, now: () => later });
    expect(second.state).toBe("published");
    const attempts = await db.select().from(publishingAttempts).where(eq(publishingAttempts.jobId, jobs[0]!.id));
    expect(attempts.map((a) => a.outcome).sort()).toEqual(["retryable_error", "success"]);
  });

  it("parks jobs for reconnection on auth errors and marks the account expired", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    setAdaptersForTesting({
      linkedin: fakeAdapter("linkedin", async () => {
        throw new PlatformError("auth", "Token revoked");
      }),
    });
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now", timezone: "UTC" });
    expect(await executePublishingJob(jobs[0]!.id, opts)).toMatchObject({ state: "needs_reconnection" });
    const [acct] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, accounts[0]!.id));
    expect(acct!.status).toBe("expired");
  });

  it("requires confirmation before retrying an ambiguous failure", async () => {
    const { ctx, accounts, content } = await setup(["x"]);
    setAdaptersForTesting({
      x: fakeAdapter("x", async () => {
        throw new PlatformError("ambiguous", "Timed out during create");
      }),
    });
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now", timezone: "UTC" });
    await executePublishingJob(jobs[0]!.id, opts);
    await expect(retryJob(ctx, jobs[0]!.id)).rejects.toMatchObject({ code: "confirm_required" });
    const retried = await retryJob(ctx, jobs[0]!.id, { confirmNotPublished: true });
    expect(retried.status).toBe("queued");
  });

  it("cancellation before execution prevents publishing", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    let published = false;
    setAdaptersForTesting({ linkedin: fakeAdapter("linkedin", async () => ((published = true), { externalPostId: "x", url: null })) });
    const local = new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "schedule", scheduledAtLocal: local, timezone: "UTC" });
    expect(jobs[0]!.status).toBe("scheduled");
    await cancelJob(ctx, jobs[0]!.id);
    const due = new Date(Date.now() + 2 * 3600_000);
    expect(await executePublishingJob(jobs[0]!.id, { ...opts, now: () => due })).toEqual({ state: "skipped" });
    expect(published).toBe(false);
    expect((await getContent(ctx.workspaceId, content.id)).status).toBe("cancelled");
  });

  it("cannot cancel once processing has started", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "now", timezone: "UTC" });
    expect(await claimJob(jobs[0]!.id, "w", new Date())).not.toBeNull();
    expect(await claimJob(jobs[0]!.id, "w2", new Date())).toBeNull(); // only one worker wins
    await expect(cancelJob(ctx, jobs[0]!.id)).rejects.toMatchObject({ status: 409 });
  });

  it("rescheduling moves the due time; the old delivery is skipped", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    const in1h = new Date(Date.now() + 3600_000);
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "schedule", scheduledAtLocal: in1h.toISOString().slice(0, 16), timezone: "UTC" });
    const in3h = new Date(Date.now() + 3 * 3600_000);
    await rescheduleJob(ctx, jobs[0]!.id, { scheduledAtLocal: in3h.toISOString().slice(0, 16), timezone: "UTC" });
    expect(await claimJob(jobs[0]!.id, "w", new Date(in1h.getTime() + 60_000))).toBeNull();
  });

  it("recovers due jobs after restart and fails stuck ones as interrupted", async () => {
    const { ctx, accounts, content } = await setup(["linkedin", "x"]);
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: accounts.map((a) => ({ socialAccountId: a.id })), mode: "now", timezone: "UTC" });
    expect(await recoverDueJobs(new Date())).toBeGreaterThanOrEqual(2);
    const claimed = await claimJob(jobs[0]!.id, "crashed-worker", new Date());
    expect(claimed).not.toBeNull();
    // Simulate the worker dying 20 minutes ago mid-publish.
    await db.update(publishingJobs).set({ lockedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(publishingJobs.id, jobs[0]!.id));
    await db.insert(publishingAttempts).values({ jobId: jobs[0]!.id, attemptNumber: 1 });
    expect(await failStuckJobs(new Date())).toBeGreaterThanOrEqual(1);
    const [job] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, jobs[0]!.id));
    expect(job).toMatchObject({ status: "failed", lastErrorCode: "interrupted" });
  });

  it("rejects destinations that fail preflight (no partial creation)", async () => {
    const { ctx, accounts, content } = await setup(["linkedin", "x"]);
    await db.update(socialAccounts).set({ status: "expired" }).where(eq(socialAccounts.id, accounts[1]!.id));
    await expect(
      createPublishingJobs(ctx, { contentId: content.id, targets: accounts.map((a) => ({ socialAccountId: a.id })), mode: "now", timezone: "UTC" }),
    ).rejects.toMatchObject({ code: "preflight_failed" });
    expect(await db.select().from(publishingJobs).where(eq(publishingJobs.contentId, content.id))).toHaveLength(0);
  });

  it("rejects schedules in the past", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    await expect(
      createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "schedule", scheduledAtLocal: "2020-01-01T10:00", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("stores schedule in UTC while preserving the user's time zone", async () => {
    const { ctx, accounts, content } = await setup(["linkedin"]);
    const year = new Date().getUTCFullYear() + 1;
    const { jobs } = await createPublishingJobs(ctx, { contentId: content.id, targets: [{ socialAccountId: accounts[0]!.id }], mode: "schedule", scheduledAtLocal: `${year}-03-10T09:00`, timezone: "Asia/Kolkata" });
    expect(new Date(jobs[0]!.scheduledAt).toISOString()).toBe(`${year}-03-10T03:30:00.000Z`);
    expect(jobs[0]!.timezone).toBe("Asia/Kolkata");
    const [c] = await db.select().from(contentItems).where(eq(contentItems.id, content.id));
    expect(c!.status).toBe("scheduled");
  });
});
