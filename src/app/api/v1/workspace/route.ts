import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { uploadedDocuments, workspaces } from "@/server/db/schema";
import { apiRoute, parseJson } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ workspace, role }) => ({ workspace: { ...workspace, role } }));

const patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidTimeZone, "Invalid time zone").optional(),
  documentRetentionDays: z.number().int().min(1).max(365).optional(),
  aiProcessingConsent: z.boolean().optional(),
});

export const PATCH = apiRoute({ role: "admin" }, async ({ req, user, workspace, correlationId }) => {
  const body = await parseJson(req, patch);
  const [updated] = await db
    .update(workspaces)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(body.timezone ? { timezone: body.timezone } : {}),
      ...(body.documentRetentionDays ? { documentRetentionDays: body.documentRetentionDays } : {}),
      ...(body.aiProcessingConsent !== undefined ? { aiProcessingConsentAt: body.aiProcessingConsent ? new Date() : null } : {}),
    })
    .where(eq(workspaces.id, workspace.id))
    .returning();
  if (body.documentRetentionDays) {
    // Re-apply retention to documents whose files still exist.
    await db
      .update(uploadedDocuments)
      .set({ expiresAt: sql`${uploadedDocuments.createdAt} + make_interval(days => ${body.documentRetentionDays})` })
      .where(eq(uploadedDocuments.workspaceId, workspace.id));
  }
  await audit({ workspaceId: workspace.id, actorUserId: user.id, action: "workspace.updated", targetType: "workspace", targetId: workspace.id, metadata: body, req, correlationId });
  return { workspace: updated };
});
