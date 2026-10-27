import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createContent } from "@/server/content/service";
import type { Database } from "@/server/db";
import { publishingJobs } from "@/server/db/schema";
import { backgroundMode } from "@/server/env";
import { claimTask, lastTickAt, tick } from "@/server/jobs/runner";
import { setAdaptersForTesting } from "@/server/platforms/registry";
import type { PlatformAdapter } from "@/server/platforms/types";
import { createPublishingJobs } from "@/server/publishing/service";
import { SKIP_ID, setupProgress, updateSetupState } from "@/server/setup/service";
import { createTestDb, seedAccount, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => t.close());
afterEach(() => setAdaptersForTesting(undefined));

const published: string[] = [];
const fake = {
  platform: "linkedin",
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
  publish: async (i: { idempotencyKey?: string }) => {
    published.push(i.idempotencyKey ?? "");
    return { externalPostId: `ext-${published.length}`, url: null };
  },
  fetchMetrics: async () => [],
} as unknown as PlatformAdapter;

describe("cron-mode scheduler", () => {
  it("defaults to cron mode without Redis or a worker", () => {
    expect(backgroundMode()).toBe("cron");
  });

  it("lets exactly one caller claim a periodic task per period", async () => {
    const now = new Date("2026-10-27T10:00:00Z");
    expect(await claimTask("unit", 5 * 60_000, now)).toBe(true);
    expect(await claimTask("unit", 5 * 60_000, new Date(now.getTime() + 60_000))).toBe(false);
    expect(await claimTask("unit", 5 * 60_000, new Date(now.getTime() + 5 * 60_000))).toBe(true);
  });

  it("publishes due posts on tick and records when it ran", async () => {
    setAdaptersForTesting({ linkedin: fake });
    const { userId, workspaceId } = await seedUserWorkspace(db);
    const account = await seedAccount(db, workspaceId, "linkedin");
    const content = await createContent(
      { workspaceId, userId },
      { title: "Tick", body: "Hello", hashtags: [], tags: [], aiGenerated: false, isTemplate: false, mediaIds: [], variants: [{ platform: "linkedin", body: "Hello", hashtags: [], includeMedia: true, aiGenerated: false }] },
    );
    const { jobs: created } = await createPublishingJobs({ workspaceId, userId, correlationId: crypto.randomUUID() }, { contentId: content.id, targets: [{ socialAccountId: account.id }], mode: "now", timezone: "UTC" });
    expect(created).toHaveLength(1);

    const report = await tick(30_000);
    expect(report.publish).toMatchObject({ due: 1, published: 1 });
    const [job] = await db.select().from(publishingJobs).where(eq(publishingJobs.id, created[0]!.id));
    expect(job!.status).toBe("published");
    expect(published).toEqual([created[0]!.id]);
    expect(await lastTickAt()).not.toBeNull();

    // A second tick finds nothing to do: the job is never published twice.
    const again = await tick(30_000);
    expect(again.publish).toMatchObject({ due: 0 });
    expect(published).toHaveLength(1);
  });
});

describe("get started progress", () => {
  it("tracks done and skipped steps per user", async () => {
    const { userId, workspaceId } = await seedUserWorkspace(db);
    let p = await setupProgress(userId, workspaceId);
    expect(p.steps.map((s) => s.id)).toEqual(["brand", "apps", "post", "publish", "autopilot", "inbox"]);
    expect(p.remaining).toBe(6);

    await updateSetupState(userId, { skip: "autopilot" });
    await updateSetupState(userId, { skip: "app:tiktok" });
    p = await setupProgress(userId, workspaceId);
    expect(p.remaining).toBe(5);
    expect(p.skipped).toEqual(expect.arrayContaining(["autopilot", "app:tiktok"]));

    await updateSetupState(userId, { unskip: "autopilot", hidden: true });
    p = await setupProgress(userId, workspaceId);
    expect(p.remaining).toBe(6);
    expect(p.hidden).toBe(true);
  });

  it("only accepts known skip ids", () => {
    for (const ok of ["brand", "app:linkedin", "server:storage"]) expect(SKIP_ID.test(ok)).toBe(true);
    for (const bad of ["drop table", "app:", "server:", "other"]) expect(SKIP_ID.test(bad)).toBe(false);
  });
});

describe("scheduler endpoint security", () => {
  const saved = { ...process.env };
  afterEach(async () => {
    process.env = { ...saved };
    (await import("@/server/env")).resetEnvCache();
  });

  async function call(env: Record<string, string>, auth?: string) {
    Object.assign(process.env, env);
    (await import("@/server/env")).resetEnvCache();
    const { GET } = await import("@/app/api/cron/tick/route");
    return GET(new Request("http://localhost/api/cron/tick", { headers: auth ? { authorization: auth } : {} }));
  }

  it("is locked in production until CRON_SECRET is set", async () => {
    expect((await call({ NODE_ENV: "production", CRON_SECRET: "" })).status).toBe(503);
  });

  it("rejects a missing or wrong secret and accepts the right one", async () => {
    const env = { NODE_ENV: "production", CRON_SECRET: "s".repeat(40) };
    expect((await call(env)).status).toBe(401);
    expect((await call(env, `Bearer ${"x".repeat(40)}`)).status).toBe(401);
    expect((await call(env, `Bearer ${"s".repeat(40)}`)).status).toBe(200);
  });
});
