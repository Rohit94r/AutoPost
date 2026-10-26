import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";

/**
 * Per-account publishing settings, e.g. default subreddit (Reddit), board (Pinterest),
 * privacy (YouTube/TikTok). Stored under metadata.settings.
 */
const settingsSchema = z
  .object({
    subreddit: z.string().trim().regex(/^(u_)?[A-Za-z0-9_]{2,21}$/, "Use a subreddit name like 'learnprogramming' (without r/)").optional(),
    boardId: z.string().trim().max(64).optional(),
    privacy: z.enum(["public", "unlisted", "private"]).optional(),
    tiktokPrivacy: z.string().max(40).optional(),
  })
  .strict();

export const PATCH = apiRoute<{ key: string }>({ role: "admin" }, async ({ req, params, user, workspace }) => {
  const id = uuidParam(params.key);
  const settings = await parseJson(req, settingsSchema);
  const [row] = await db
    .update(socialAccounts)
    .set({ metadata: sql`jsonb_set(${socialAccounts.metadata}, '{settings}', coalesce(${socialAccounts.metadata}->'settings', '{}'::jsonb) || ${JSON.stringify(settings)}::jsonb)` })
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.workspaceId, workspace.id)))
    .returning({ id: socialAccounts.id, metadata: socialAccounts.metadata });
  if (!row) throw notFound("Account");
  await audit({ workspaceId: workspace.id, actorUserId: user.id, action: "social_account.settings_updated", targetType: "social_account", targetId: id, metadata: settings, req });
  return { settings: (row.metadata as { settings?: unknown }).settings ?? {} };
});
