import "server-only";
import { db, type DbOrTx } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { logger } from "@/server/logger";

export interface AuditEntry {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
  correlationId?: string;
}

/** Records a sensitive operation. Never include secrets or document contents in metadata. */
export async function audit(entry: AuditEntry, conn: DbOrTx = db) {
  try {
    await conn.insert(auditLogs).values({
      workspaceId: entry.workspaceId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      ipAddress: entry.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: entry.req?.headers.get("user-agent")?.slice(0, 300) ?? null,
      correlationId: entry.correlationId,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "failed to write audit log");
  }
}
