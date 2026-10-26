import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContent, getContent, listContent, listQuery, updateContent } from "@/server/content/service";
import { sha256 } from "@/server/crypto";
import type { Database } from "@/server/db";
import { oauthStates, uploadedDocuments, usageRecords } from "@/server/db/schema";
import { purgeExpiredDocumentFiles } from "@/server/documents/service";
import { consumeState, disconnectAccount, pkcePair } from "@/server/oauth/service";
import { createPublishingJobs } from "@/server/publishing/service";
import { assertQuota, recordUsage } from "@/server/usage/service";
import { assertWorkspaceAccess, ensurePersonalWorkspace, roleAtLeast } from "@/server/workspaces/service";
import { createTestDb, seedAccount, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => t.close());

const draft = { title: "Secret plan", body: "internal", hashtags: [], tags: [], aiGenerated: false, isTemplate: false, mediaIds: [], variants: [] };

describe("workspace isolation", () => {
  it("never returns another workspace's content", async () => {
    const a = await seedUserWorkspace(db);
    const b = await seedUserWorkspace(db);
    const c = await createContent(a, draft);
    await expect(getContent(b.workspaceId, c.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateContent(b, c.id, { title: "hijack" })).rejects.toMatchObject({ status: 404 });
    expect((await listContent(b.workspaceId, listQuery.parse({}))).total).toBe(0);
    expect((await listContent(a.workspaceId, listQuery.parse({ q: "secret" }))).total).toBe(1);
  });

  it("rejects non-members and insufficient roles", async () => {
    const a = await seedUserWorkspace(db);
    const outsider = await seedUserWorkspace(db);
    await expect(assertWorkspaceAccess(outsider.userId, a.workspaceId)).rejects.toMatchObject({ status: 403 });
    const viewer = await seedUserWorkspace(db, { role: "viewer" });
    await expect(assertWorkspaceAccess(viewer.userId, viewer.workspaceId, "editor")).rejects.toMatchObject({ status: 403 });
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
  });

  it("can't attach media or publish to another workspace's account", async () => {
    const a = await seedUserWorkspace(db);
    const b = await seedUserWorkspace(db);
    const foreign = await seedAccount(db, b.workspaceId, "linkedin");
    const c = await createContent(a, { ...draft, variants: [{ platform: "linkedin", body: "hi", hashtags: [], includeMedia: true, aiGenerated: false }] });
    await expect(
      createPublishingJobs({ ...a, correlationId: "c" }, { contentId: c.id, targets: [{ socialAccountId: foreign.id }], mode: "now", timezone: "UTC" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(createContent(a, { ...draft, mediaIds: [crypto.randomUUID()] })).rejects.toMatchObject({ status: 400 });
  });

  it("creates a personal workspace once per user", async () => {
    const { userId } = await seedUserWorkspace(db);
    const first = await ensurePersonalWorkspace({ id: userId, name: "X", email: "x@y.z" });
    const second = await ensurePersonalWorkspace({ id: userId, name: "X", email: "x@y.z" });
    expect(first).toBe(second);
  });
});

describe("OAuth state", () => {
  async function makeState(userId: string, workspaceId: string, expiresIn = 600_000) {
    const state = crypto.randomUUID();
    await db.insert(oauthStates).values({ stateHash: sha256(state), workspaceId, userId, platform: "x", expiresAt: new Date(Date.now() + expiresIn) });
    return state;
  }

  it("is single-use and bound to user and platform", async () => {
    const a = await seedUserWorkspace(db);
    const other = await seedUserWorkspace(db);
    const s1 = await makeState(a.userId, a.workspaceId);
    expect(await consumeState(s1, "linkedin", a.userId)).toBeNull();
    expect(await consumeState(s1, "x", other.userId)).toBeNull();
    expect(await consumeState(s1, "x", a.userId)).not.toBeNull();
    expect(await consumeState(s1, "x", a.userId)).toBeNull(); // replay
    const expired = await makeState(a.userId, a.workspaceId, -1000);
    expect(await consumeState(expired, "x", a.userId)).toBeNull();
    expect(await consumeState("forged", "x", a.userId)).toBeNull();
  });

  it("generates valid PKCE pairs", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("disconnect deletes credentials and parks scheduled jobs", async () => {
    const a = await seedUserWorkspace(db);
    const acct = await seedAccount(db, a.workspaceId, "linkedin");
    const c = await createContent(a, { ...draft, variants: [{ platform: "linkedin", body: "hi", hashtags: [], includeMedia: true, aiGenerated: false }] });
    const at = new Date(Date.now() + 7200_000).toISOString().slice(0, 16);
    const { jobs } = await createPublishingJobs({ ...a, correlationId: "c" }, { contentId: c.id, targets: [{ socialAccountId: acct.id }], mode: "schedule", scheduledAtLocal: at, timezone: "UTC" });
    const r = await disconnectAccount({ workspaceId: a.workspaceId, accountId: acct.id, userId: a.userId });
    expect(r.note).toMatch(/LinkedIn/);
    const after = await getContent(a.workspaceId, c.id);
    expect(after.jobs.find((j) => j.id === jobs[0]!.id)!.status).toBe("needs_reconnection");
  });
});

describe("quotas", () => {
  it("enforces plan limits server-side", async () => {
    const a = await seedUserWorkspace(db, { plan: "free" });
    await recordUsage({ workspaceId: a.workspaceId, metric: "publishing_job", quantity: 60 });
    await expect(assertQuota(a.workspaceId, "publishing")).rejects.toMatchObject({ status: 402, code: "quota_exceeded" });
    await expect(assertQuota(a.workspaceId, "ai")).resolves.toBeUndefined();
    await db.delete(usageRecords).where(eq(usageRecords.workspaceId, a.workspaceId));
    await expect(assertQuota(a.workspaceId, "publishing")).resolves.toBeUndefined();
  });

  it("counts connected accounts against the plan", async () => {
    const a = await seedUserWorkspace(db, { plan: "free" });
    for (let i = 0; i < 3; i++) await seedAccount(db, a.workspaceId, "x");
    await expect(assertQuota(a.workspaceId, "account")).rejects.toMatchObject({ status: 402 });
  });
});

describe("retention", () => {
  it("purges expired document files but keeps the record", async () => {
    const a = await seedUserWorkspace(db);
    t.mem.set("documents/x/old.pdf", Buffer.from("%PDF"));
    const [doc] = await db
      .insert(uploadedDocuments)
      .values({ workspaceId: a.workspaceId, originalFilename: "old.pdf", mimeType: "application/pdf", sizeBytes: 4, sha256: "x", storageKey: "documents/x/old.pdf", expiresAt: new Date(Date.now() - 1000) })
      .returning();
    expect(await purgeExpiredDocumentFiles()).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, doc!.id));
    expect(row!.storageKey).toBeNull();
    expect(row!.fileDeletedAt).not.toBeNull();
    expect(t.mem.has("documents/x/old.pdf")).toBe(false);
  });
});
