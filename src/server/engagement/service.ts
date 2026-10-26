import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PLATFORM_META, PLATFORMS, platformLimits, textLength, type Platform } from "@/lib/platforms";
import { draftReply } from "@/server/ai/engagement-ai";
import { audit } from "@/server/audit";
import { getBrand, getDefaultBrand, toVoice } from "@/server/brand/service";
import { db } from "@/server/db";
import { autoReplyRules, engagementItems, publishedPosts, socialAccounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError, badRequest, conflict, notFound } from "@/server/errors";
import { logger } from "@/server/logger";
import { notify } from "@/server/notifications/service";
import { getAccessToken } from "@/server/oauth/service";
import { getAdapter } from "@/server/platforms/registry";
import { PlatformError, type EngagementInput } from "@/server/platforms/types";

type AccountRow = typeof socialAccounts.$inferSelect;
type ItemRow = typeof engagementItems.$inferSelect;

const DAY = 86400_000;
const accountRef = (a: AccountRow) => ({ externalAccountId: a.externalAccountId, accountType: a.accountType, username: a.username, metadata: a.metadata });

/** Platforms whose engagement we can read for this deployment (X reads are billed: opt-in). */
export function engagementEnabled(platform: Platform) {
  const can = PLATFORM_META[platform].can;
  if (can.comments === "none" && !can.mentions) return false;
  if (platform === "x" && !env().ENGAGEMENT_X_ENABLED) return false;
  return true;
}

/* ─────────────────────────────── Sync ─────────────────────────────── */

async function upsertItems(account: AccountRow, items: EngagementInput[], postId: string | null) {
  if (!items.length) return 0;
  const rows = items.map((i) => ({
    workspaceId: account.workspaceId,
    socialAccountId: account.id,
    publishedPostId: postId,
    platform: account.platform,
    kind: i.kind,
    externalId: i.externalId,
    postExternalId: i.postExternalId ?? null,
    parentExternalId: i.parentExternalId ?? null,
    authorName: i.authorName ?? null,
    authorHandle: i.authorHandle ?? null,
    authorExternalId: i.authorExternalId ?? null,
    authorAvatarUrl: i.authorAvatarUrl ?? null,
    text: i.text.slice(0, 10_000),
    permalink: i.permalink ?? null,
    replyTarget: i.replyTarget ?? {},
    isOwn: Boolean(i.isOwn),
    status: i.isOwn ? "own" : "new",
    occurredAt: i.occurredAt,
  }));
  const inserted = await db.insert(engagementItems).values(rows).onConflictDoNothing().returning({ id: engagementItems.id });
  return inserted.length;
}

/** Pull recent posts (where supported), their comments, and mentions for one account. */
export async function syncAccount(account: AccountRow) {
  const adapter = getAdapter(account.platform);
  const can = PLATFORM_META[account.platform].can;
  const accessToken = await getAccessToken(account);
  const acc = accountRef(account);
  let newItems = 0;

  if (can.importPosts && adapter.fetchRecentPosts && (account.platform !== "x" || engagementEnabled("x"))) {
    try {
      const posts = await adapter.fetchRecentPosts({ accessToken, account: acc, limit: 20 });
      if (posts.length) {
        await db
          .insert(publishedPosts)
          .values(
            posts.map((p) => ({
              workspaceId: account.workspaceId,
              socialAccountId: account.id,
              platform: account.platform,
              externalPostId: p.externalPostId,
              url: p.url,
              source: "imported",
              text: p.text?.slice(0, 5000) ?? null,
              thumbnailUrl: p.thumbnailUrl ?? null,
              publishedAt: p.publishedAt,
            })),
          )
          .onConflictDoNothing();
      }
    } catch (err) {
      if (err instanceof PlatformError && err.kind === "auth") throw err;
      logger.warn({ err, accountId: account.id }, "post import failed");
    }
  }

  if (can.comments !== "none" && adapter.fetchComments && engagementEnabled(account.platform)) {
    const posts = await db
      .select()
      .from(publishedPosts)
      .where(and(eq(publishedPosts.socialAccountId, account.id), gte(publishedPosts.publishedAt, new Date(Date.now() - 14 * DAY))))
      .orderBy(desc(publishedPosts.publishedAt))
      .limit(25);
    for (const post of posts) {
      try {
        const items = await adapter.fetchComments({ accessToken, account: acc, postExternalId: post.externalPostId, since: post.lastCommentsAt });
        newItems += await upsertItems(account, items, post.id);
        await db.update(publishedPosts).set({ lastCommentsAt: new Date() }).where(eq(publishedPosts.id, post.id));
      } catch (err) {
        if (err instanceof PlatformError && (err.kind === "auth" || err.kind === "rate_limit")) throw err;
        logger.warn({ err, postId: post.id }, "comment sync failed");
      }
    }
  }

  if (can.mentions && adapter.fetchMentions && engagementEnabled(account.platform)) {
    try {
      newItems += await upsertItems(account, await adapter.fetchMentions({ accessToken, account: acc, since: null }), null);
    } catch (err) {
      if (err instanceof PlatformError && err.kind === "auth") throw err;
      logger.warn({ err, accountId: account.id }, "mention sync failed");
    }
  }

  await db
    .update(socialAccounts)
    .set({ metadata: sql`${socialAccounts.metadata} || ${JSON.stringify({ engagementSyncedAt: new Date().toISOString() })}::jsonb` })
    .where(eq(socialAccounts.id, account.id));
  if (newItems) {
    await notify({
      workspaceId: account.workspaceId,
      type: "engagement_new",
      title: `${newItems} new comment${newItems === 1 ? "" : "s"} on ${PLATFORM_META[account.platform].label}`,
      body: account.displayName,
      link: `/inbox?platform=${account.platform}`,
      dedupeKey: `engagement:${account.id}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
  return newItems;
}

/** Worker: sync every connected account whose last sync is older than ENGAGEMENT_SYNC_MINUTES. */
export async function syncDueAccounts(limit = 30) {
  const minutes = env().ENGAGEMENT_SYNC_MINUTES;
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.status, "connected"),
        inArray(socialAccounts.platform, PLATFORMS.filter((p) => engagementEnabled(p) || PLATFORM_META[p].can.importPosts)),
        or(sql`${socialAccounts.metadata}->>'engagementSyncedAt' is null`, sql`${socialAccounts.metadata}->>'engagementSyncedAt' < ${cutoff}`),
      ),
    )
    .limit(limit);
  let total = 0;
  for (const a of accounts) {
    try {
      total += await syncAccount(a);
    } catch (err) {
      logger.warn({ err, accountId: a.id }, "engagement sync failed");
    }
  }
  return { accounts: accounts.length, newItems: total };
}

/* ─────────────────────────────── Inbox ─────────────────────────────── */

export const inboxQuery = z.object({
  status: z.enum(["open", "new", "needs_review", "replied", "ignored", "all"]).default("open"),
  platform: z.enum(PLATFORMS).optional(),
  accountId: z.string().uuid().optional(),
  postId: z.string().uuid().optional(),
  kind: z.enum(["comment", "reply", "mention"]).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export async function listInbox(workspaceId: string, q: z.infer<typeof inboxQuery>) {
  const conds: (SQL | undefined)[] = [eq(engagementItems.workspaceId, workspaceId), ne(engagementItems.status, "own")];
  if (q.status === "open") conds.push(inArray(engagementItems.status, ["new", "needs_review"]));
  else if (q.status !== "all") conds.push(eq(engagementItems.status, q.status));
  if (q.platform) conds.push(eq(engagementItems.platform, q.platform));
  if (q.accountId) conds.push(eq(engagementItems.socialAccountId, q.accountId));
  if (q.postId) conds.push(eq(engagementItems.publishedPostId, q.postId));
  if (q.kind) conds.push(eq(engagementItems.kind, q.kind));
  if (q.q) conds.push(ilike(engagementItems.text, `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const where = and(...conds);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        item: engagementItems,
        account: { id: socialAccounts.id, displayName: socialAccounts.displayName, username: socialAccounts.username, avatarUrl: socialAccounts.avatarUrl },
        post: { id: publishedPosts.id, text: publishedPosts.text, url: publishedPosts.url, thumbnailUrl: publishedPosts.thumbnailUrl },
      })
      .from(engagementItems)
      .innerJoin(socialAccounts, eq(socialAccounts.id, engagementItems.socialAccountId))
      .leftJoin(publishedPosts, eq(publishedPosts.id, engagementItems.publishedPostId))
      .where(where)
      .orderBy(desc(engagementItems.occurredAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(engagementItems).where(where),
  ]);
  return { items: rows.map((r) => ({ ...r.item, account: r.account, post: r.post?.id ? r.post : null })), total: total?.n ?? 0, page: q.page, pageSize: q.pageSize };
}

export async function inboxCounts(workspaceId: string) {
  return db
    .select({ platform: engagementItems.platform, status: engagementItems.status, n: count() })
    .from(engagementItems)
    .where(and(eq(engagementItems.workspaceId, workspaceId), ne(engagementItems.status, "own")))
    .groupBy(engagementItems.platform, engagementItems.status);
}

async function loadItem(workspaceId: string, id: string) {
  const [row] = await db
    .select({ item: engagementItems, account: socialAccounts })
    .from(engagementItems)
    .innerJoin(socialAccounts, eq(socialAccounts.id, engagementItems.socialAccountId))
    .where(and(eq(engagementItems.id, id), eq(engagementItems.workspaceId, workspaceId)));
  if (!row) throw notFound("Comment");
  return row;
}

async function postReply(item: ItemRow, account: AccountRow, text: string) {
  const adapter = getAdapter(account.platform);
  if (!adapter.reply || PLATFORM_META[account.platform].can.comments !== "read_reply") {
    throw new AppError(422, "reply_unsupported", `${PLATFORM_META[account.platform].label} doesn't allow replying through its API.`);
  }
  if (account.status !== "connected") throw conflict(`${account.displayName} needs to be reconnected before replying.`);
  const limit = platformLimits(account.platform).maxChars;
  if (textLength(account.platform, text) > limit) throw badRequest(`Replies on ${PLATFORM_META[account.platform].label} are limited to ${limit} characters.`);
  const accessToken = await getAccessToken(account);
  return adapter.reply({
    accessToken,
    account: accountRef(account),
    target: { externalId: item.externalId, postExternalId: item.postExternalId, replyTarget: item.replyTarget },
    text,
  });
}

/** Manual reply from the web inbox — sent to the platform immediately. */
export async function replyToItem(ctx: { workspaceId: string; userId: string; req?: Request }, id: string, text: string) {
  const { item, account } = await loadItem(ctx.workspaceId, id);
  if (item.status === "replied") throw conflict("This comment already has a reply from Verdant.");
  const trimmed = text.trim();
  if (!trimmed) throw badRequest("Write a reply first.");
  try {
    const r = await postReply(item, account, trimmed);
    await db
      .update(engagementItems)
      .set({ status: "replied", replyText: trimmed, replyExternalId: r.externalId, repliedAt: new Date(), repliedBy: "user", draftReply: null })
      .where(eq(engagementItems.id, id));
    await audit({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "engagement.replied", targetType: "engagement_item", targetId: id, metadata: { platform: account.platform }, req: ctx.req });
    return { ok: true, url: r.url ?? null };
  } catch (err) {
    if (err instanceof PlatformError) throw new AppError(err.kind === "auth" ? 409 : err.kind === "rate_limit" ? 429 : 422, `platform_${err.kind}`, err.message);
    throw err;
  }
}

export async function setItemStatus(workspaceId: string, id: string, status: "new" | "needs_review" | "ignored") {
  await loadItem(workspaceId, id);
  await db.update(engagementItems).set({ status }).where(eq(engagementItems.id, id));
}

/** AI-suggested reply for the inbox (nothing is posted). */
export async function suggestReply(ctx: { workspaceId: string; userId: string; correlationId: string }, id: string) {
  const { item, account } = await loadItem(ctx.workspaceId, id);
  const post = item.publishedPostId ? (await db.select({ text: publishedPosts.text }).from(publishedPosts).where(eq(publishedPosts.id, item.publishedPostId)))[0] : null;
  const voice = toVoice(await getDefaultBrand(ctx.workspaceId));
  const d = await draftReply(ctx, { platform: account.platform, comment: item.text, authorName: item.authorName, postText: post?.text, voice });
  await db.update(engagementItems).set({ draftReply: d.reply, sentiment: d.sentiment }).where(eq(engagementItems.id, id));
  return d;
}

/* ───────────────────────────── Autopilot ───────────────────────────── */

export const ruleInput = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  socialAccountIds: z.array(z.string().uuid()).max(50).default([]),
  trigger: z.enum(["all", "keywords", "mentions", "questions"]).default("all"),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  instructions: z.string().max(2000).nullish(),
  mode: z.enum(["draft", "auto"]).default("draft"),
  dailyLimit: z.number().int().min(1).max(500).default(50),
  skipNegative: z.boolean().default(true),
  brandProfileId: z.string().uuid().nullish(),
});

export const listRules = (workspaceId: string) => db.select().from(autoReplyRules).where(eq(autoReplyRules.workspaceId, workspaceId)).orderBy(desc(autoReplyRules.createdAt));

export async function saveRule(ctx: { workspaceId: string; userId: string }, input: z.infer<typeof ruleInput>, id?: string) {
  if (input.trigger === "keywords" && !input.keywords.length) throw badRequest("Add at least one keyword for a keyword rule.");
  if (input.socialAccountIds.length) {
    const owned = await db.select({ id: socialAccounts.id }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, ctx.workspaceId), inArray(socialAccounts.id, input.socialAccountIds)));
    if (owned.length !== new Set(input.socialAccountIds).size) throw badRequest("Some selected accounts don't belong to this workspace.");
  }
  if (id) {
    const [row] = await db.update(autoReplyRules).set(input).where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.workspaceId, ctx.workspaceId))).returning();
    if (!row) throw notFound("Rule");
    return row;
  }
  const [row] = await db.insert(autoReplyRules).values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId }).returning();
  return row!;
}

export async function deleteRule(workspaceId: string, id: string) {
  await db.delete(autoReplyRules).where(and(eq(autoReplyRules.id, id), eq(autoReplyRules.workspaceId, workspaceId)));
}

type Rule = typeof autoReplyRules.$inferSelect;

/** Pure rule matcher (unit-tested). */
export function ruleMatches(rule: Pick<Rule, "enabled" | "socialAccountIds" | "trigger" | "keywords">, item: Pick<ItemRow, "socialAccountId" | "kind" | "text" | "isOwn">) {
  if (!rule.enabled || item.isOwn) return false;
  if (rule.socialAccountIds.length && !rule.socialAccountIds.includes(item.socialAccountId)) return false;
  const text = item.text.toLowerCase();
  switch (rule.trigger) {
    case "all":
      return true;
    case "mentions":
      return item.kind === "mention";
    case "questions":
      return /\?|^(how|what|why|when|where|who|can|could|do|does|is|are|will|would)\b/i.test(item.text.trim());
    case "keywords":
      return rule.keywords.some((k) => text.includes(k.toLowerCase()));
    default:
      return false;
  }
}

/**
 * Runs enabled rules over new comments (last 3 days). Safety:
 * - never replies to the account's own comments or twice to the same comment;
 * - spam/abuse are never answered; negative comments go to review when skipNegative is on;
 * - per-rule daily caps; one auto-reply per author per post per day;
 * - "draft" mode only prepares replies for a human to approve.
 */
export async function runAutopilot(limit = 40) {
  const rules = await db.select().from(autoReplyRules).where(eq(autoReplyRules.enabled, true));
  if (!rules.length) return { processed: 0, replied: 0, drafted: 0 };
  const byWorkspace = new Map<string, Rule[]>();
  for (const r of rules) byWorkspace.set(r.workspaceId, [...(byWorkspace.get(r.workspaceId) ?? []), r]);
  const since = new Date(Date.now() - 3 * DAY);
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  let processed = 0;
  let replied = 0;
  let drafted = 0;

  for (const [workspaceId, wsRules] of byWorkspace) {
    const items = await db
      .select({ item: engagementItems, account: socialAccounts })
      .from(engagementItems)
      .innerJoin(socialAccounts, eq(socialAccounts.id, engagementItems.socialAccountId))
      .where(and(eq(engagementItems.workspaceId, workspaceId), eq(engagementItems.status, "new"), isNull(engagementItems.autopilotRuleId), gte(engagementItems.occurredAt, since)))
      .orderBy(engagementItems.occurredAt)
      .limit(limit);
    for (const { item, account } of items) {
      const rule = wsRules.find((r) => ruleMatches(r, item));
      if (!rule || PLATFORM_META[account.platform].can.comments !== "read_reply") continue;
      processed++;
      const [{ n: usedToday } = { n: 0 }] = await db
        .select({ n: count() })
        .from(engagementItems)
        .where(and(eq(engagementItems.autopilotRuleId, rule.id), eq(engagementItems.repliedBy, "autopilot"), gte(engagementItems.repliedAt, todayStart)));
      const post = item.publishedPostId ? (await db.select({ text: publishedPosts.text }).from(publishedPosts).where(eq(publishedPosts.id, item.publishedPostId)))[0] : null;
      const previous = await db
        .select({ t: engagementItems.replyText })
        .from(engagementItems)
        .where(and(eq(engagementItems.socialAccountId, account.id), eq(engagementItems.repliedBy, "autopilot")))
        .orderBy(desc(engagementItems.repliedAt))
        .limit(5);
      const sameAuthorToday = item.authorExternalId
        ? (
            await db
              .select({ n: count() })
              .from(engagementItems)
              .where(
                and(
                  eq(engagementItems.socialAccountId, account.id),
                  eq(engagementItems.authorExternalId, item.authorExternalId),
                  eq(engagementItems.repliedBy, "autopilot"),
                  gte(engagementItems.repliedAt, new Date(Date.now() - DAY)),
                  item.publishedPostId ? eq(engagementItems.publishedPostId, item.publishedPostId) : sql`true`,
                ),
              )
          )[0]?.n ?? 0
        : 0;

      const brand = rule.brandProfileId ? await getBrand(workspaceId, rule.brandProfileId).catch(() => null) : await getDefaultBrand(workspaceId);
      let decision;
      try {
        decision = await draftReply(
          { workspaceId, correlationId: `autopilot-${item.id}` },
          { platform: account.platform, comment: item.text, authorName: item.authorName, postText: post?.text, instructions: rule.instructions, voice: toVoice(brand), previousReplies: previous.map((p) => p.t ?? "").filter(Boolean) },
        );
      } catch (err) {
        logger.warn({ err, itemId: item.id }, "autopilot draft failed");
        await db.update(engagementItems).set({ autopilotRuleId: rule.id, status: "needs_review", autopilotNote: "AI draft failed. Reply manually." }).where(eq(engagementItems.id, item.id));
        continue;
      }
      const base = { autopilotRuleId: rule.id, sentiment: decision.sentiment, draftReply: decision.reply || null };
      const toReview = (note: string) => db.update(engagementItems).set({ ...base, status: "needs_review", autopilotNote: note }).where(eq(engagementItems.id, item.id));

      if (!decision.shouldReply || decision.sentiment === "spam" || decision.sentiment === "abusive") {
        await db.update(engagementItems).set({ ...base, status: decision.sentiment === "spam" ? "ignored" : "needs_review", autopilotNote: decision.reason || "Not answered automatically." }).where(eq(engagementItems.id, item.id));
        continue;
      }
      if (rule.skipNegative && decision.sentiment === "negative") {
        await toReview("Negative comment. Draft prepared for you to review.");
        drafted++;
        continue;
      }
      if (rule.mode === "draft" || usedToday >= rule.dailyLimit || sameAuthorToday > 0 || !decision.reply) {
        await toReview(rule.mode === "draft" ? "Draft ready for approval." : usedToday >= rule.dailyLimit ? "Daily auto-reply limit reached." : "Already replied to this person today.");
        drafted++;
        continue;
      }
      try {
        const r = await postReply(item, account, decision.reply);
        await db
          .update(engagementItems)
          .set({ ...base, status: "replied", replyText: decision.reply, replyExternalId: r.externalId, repliedAt: new Date(), repliedBy: "autopilot", autopilotNote: `Auto-replied by "${rule.name}".` })
          .where(eq(engagementItems.id, item.id));
        replied++;
      } catch (err) {
        logger.warn({ err, itemId: item.id }, "autopilot reply failed");
        await toReview(`Couldn't post automatically: ${(err as Error).message}`.slice(0, 300));
      }
    }
  }
  return { processed, replied, drafted };
}

/** Old, untouched items are archived so the inbox stays focused. */
export async function archiveStaleItems() {
  await db
    .update(engagementItems)
    .set({ status: "ignored", autopilotNote: "Archived after 30 days without action." })
    .where(and(eq(engagementItems.status, "new"), lt(engagementItems.occurredAt, new Date(Date.now() - 30 * DAY))));
}
