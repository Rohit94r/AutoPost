import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ModelRegistry, setRegistryForTesting } from "@/server/ai/registry";
import type { AIProvider } from "@/server/ai/types";
import type { Database } from "@/server/db";
import { engagementItems, publishedPosts } from "@/server/db/schema";
import { listInbox, inboxQuery, replyToItem, ruleMatches, runAutopilot, saveRule, syncAccount } from "@/server/engagement/service";
import { setAdaptersForTesting } from "@/server/platforms/registry";
import type { EngagementInput, PlatformAdapter } from "@/server/platforms/types";
import { createTestDb, seedAccount, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => t.close());
afterEach(() => {
  setAdaptersForTesting(undefined);
  setRegistryForTesting(undefined);
});

const now = () => new Date();

function fakeMastodon(comments: EngagementInput[], replies: string[]): PlatformAdapter {
  return {
    platform: "mastodon",
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
    publish: async () => ({ externalPostId: "x", url: null }),
    fetchMetrics: async () => [],
    fetchRecentPosts: async () => [{ externalPostId: "post-1", url: "https://m/1", text: "Our new café is open", publishedAt: now() }],
    fetchComments: async () => comments,
    fetchMentions: async () => [],
    reply: async ({ text }) => {
      replies.push(text);
      return { externalId: `reply-${replies.length}` };
    },
  };
}

function fakeAI(decision: { shouldReply: boolean; sentiment: string; reply: string }): ModelRegistry {
  const p: AIProvider = {
    id: "groq",
    supportsFiles: false,
    isConfigured: () => true,
    generate: async (r) => ({ text: JSON.stringify({ ...decision, reason: "test" }), model: r.model, inputTokens: 1, outputTokens: 1, providerRequestId: null, finishReason: "stop" }),
  };
  return new ModelRegistry({ groq: p, gemini: { ...p, id: "gemini", isConfigured: () => false } });
}

const comment = (id: string, text: string, extra: Partial<EngagementInput> = {}): EngagementInput => ({
  externalId: id,
  kind: "comment",
  postExternalId: "post-1",
  authorName: "Ana",
  authorHandle: "ana",
  authorExternalId: `author-${id}`,
  text,
  occurredAt: now(),
  replyTarget: { acct: "ana" },
  ...extra,
});

describe("engagement", () => {
  it("imports posts, syncs comments idempotently and hides own comments", async () => {
    const ws = await seedUserWorkspace(db);
    const acct = await seedAccount(db, ws.workspaceId, "mastodon", { metadata: { instanceUrl: "https://m", accountId: "1" }, tokenExpiresAt: null });
    setAdaptersForTesting({ mastodon: fakeMastodon([comment("c1", "Love it!"), comment("c2", "my own note", { isOwn: true })], []) });
    expect(await syncAccount(acct)).toBe(2);
    expect(await syncAccount(acct)).toBe(0); // no duplicates
    const posts = await db.select().from(publishedPosts).where(eq(publishedPosts.socialAccountId, acct.id));
    expect(posts[0]).toMatchObject({ source: "imported", text: "Our new café is open" });
    const inbox = await listInbox(ws.workspaceId, inboxQuery.parse({}));
    expect(inbox.items.map((i) => i.text)).toEqual(["Love it!"]);
    expect(inbox.items[0]!.post?.text).toBe("Our new café is open");
  });

  it("posts manual replies and refuses double replies", async () => {
    const ws = await seedUserWorkspace(db);
    const acct = await seedAccount(db, ws.workspaceId, "mastodon", { metadata: { instanceUrl: "https://m", accountId: "1" }, tokenExpiresAt: null });
    const sent: string[] = [];
    setAdaptersForTesting({ mastodon: fakeMastodon([comment("c9", "Where is it?")], sent) });
    await syncAccount(acct);
    const [item] = await db.select().from(engagementItems).where(eq(engagementItems.socialAccountId, acct.id));
    await replyToItem({ workspaceId: ws.workspaceId, userId: ws.userId }, item!.id, "On Main Street!");
    expect(sent).toEqual(["On Main Street!"]);
    await expect(replyToItem({ workspaceId: ws.workspaceId, userId: ws.userId }, item!.id, "again")).rejects.toMatchObject({ status: 409 });
    const other = await seedUserWorkspace(db);
    await expect(replyToItem({ workspaceId: other.workspaceId, userId: other.userId }, item!.id, "hijack")).rejects.toMatchObject({ status: 404 });
  });

  it("autopilot auto-replies to friendly comments and routes negative ones to review", async () => {
    const ws = await seedUserWorkspace(db);
    const acct = await seedAccount(db, ws.workspaceId, "mastodon", { metadata: { instanceUrl: "https://m", accountId: "1" }, tokenExpiresAt: null });
    const sent: string[] = [];
    setAdaptersForTesting({ mastodon: fakeMastodon([comment("p1", "Congrats, looks amazing")], sent) });
    await syncAccount(acct);
    await saveRule({ workspaceId: ws.workspaceId, userId: ws.userId }, { name: "Thanks", enabled: true, socialAccountIds: [], trigger: "all", keywords: [], mode: "auto", dailyLimit: 5, skipNegative: true });

    setRegistryForTesting(fakeAI({ shouldReply: true, sentiment: "positive", reply: "Thank you so much!" }));
    const r1 = await runAutopilot();
    expect(r1.replied).toBe(1);
    expect(sent).toEqual(["Thank you so much!"]);

    setAdaptersForTesting({ mastodon: fakeMastodon([comment("n1", "This is terrible service")], sent) });
    await syncAccount(acct);
    setRegistryForTesting(fakeAI({ shouldReply: true, sentiment: "negative", reply: "Sorry to hear that." }));
    await runAutopilot();
    const [neg] = await db.select().from(engagementItems).where(eq(engagementItems.externalId, "n1"));
    expect(neg).toMatchObject({ status: "needs_review", draftReply: "Sorry to hear that." });
    expect(sent).toHaveLength(1); // nothing posted for the negative comment
  });

  it("autopilot never answers spam and draft mode never posts", async () => {
    const ws = await seedUserWorkspace(db);
    const acct = await seedAccount(db, ws.workspaceId, "mastodon", { metadata: { instanceUrl: "https://m", accountId: "1" }, tokenExpiresAt: null });
    const sent: string[] = [];
    setAdaptersForTesting({ mastodon: fakeMastodon([comment("s1", "cheap followers here"), comment("q1", "When does it open?")], sent) });
    await syncAccount(acct);
    await saveRule({ workspaceId: ws.workspaceId, userId: ws.userId }, { name: "Drafts", enabled: true, socialAccountIds: [], trigger: "all", keywords: [], mode: "draft", dailyLimit: 5, skipNegative: true });
    setRegistryForTesting(fakeAI({ shouldReply: false, sentiment: "spam", reply: "" }));
    await runAutopilot();
    const rows = await db.select().from(engagementItems).where(eq(engagementItems.socialAccountId, acct.id));
    expect(rows.find((r) => r.externalId === "s1")!.status).toBe("ignored");
    expect(sent).toEqual([]);
  });

  it("matches rules by trigger", () => {
    const base = { enabled: true, socialAccountIds: [] as string[], keywords: ["price"] };
    const item = { socialAccountId: "a", kind: "comment", text: "What's the price?", isOwn: false };
    expect(ruleMatches({ ...base, trigger: "keywords" }, item)).toBe(true);
    expect(ruleMatches({ ...base, trigger: "questions" }, item)).toBe(true);
    expect(ruleMatches({ ...base, trigger: "mentions" }, item)).toBe(false);
    expect(ruleMatches({ ...base, trigger: "all" }, { ...item, isOwn: true })).toBe(false);
    expect(ruleMatches({ ...base, trigger: "all", socialAccountIds: ["b"] }, item)).toBe(false);
  });
});
