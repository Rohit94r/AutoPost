import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { notifications, workspaceMembers } from "@/server/db/schema";
import { logger } from "@/server/logger";

export type NotificationType =
  | "publish_succeeded"
  | "publish_failed"
  | "publish_partial"
  | "account_expiring"
  | "account_reconnect"
  | "schedule_reminder"
  | "ai_failed"
  | "document_ready"
  | "document_failed"
  | "engagement_new";

export interface NotifyInput {
  workspaceId: string;
  /** Specific recipient; when omitted every workspace member (editor+) is notified. */
  userId?: string;
  type: NotificationType;
  severity?: "info" | "success" | "warning" | "error";
  title: string;
  body?: string;
  link?: string;
  /** Prevents duplicates (e.g. one "expiring" notice per account per day). */
  dedupeKey?: string;
}

export async function notify(input: NotifyInput, conn: DbOrTx = db) {
  try {
    const recipients = input.userId
      ? [input.userId]
      : (
          await conn
            .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.workspaceId, input.workspaceId))
        )
          .filter((m) => m.role !== "viewer")
          .map((m) => m.userId);
    if (!recipients.length) return;
    await conn
      .insert(notifications)
      .values(
        recipients.map((userId) => ({
          workspaceId: input.workspaceId,
          userId,
          type: input.type,
          severity: input.severity ?? "info",
          title: input.title,
          body: input.body,
          link: input.link,
          dedupeKey: input.dedupeKey ?? null,
        })),
      )
      .onConflictDoNothing();
  } catch (err) {
    logger.error({ err, type: input.type }, "failed to create notification");
  }
}

export async function listNotifications(userId: string, workspaceId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllRead(userId: string, workspaceId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)));
}
