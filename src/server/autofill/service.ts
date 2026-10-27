import "server-only";
import { eq } from "drizzle-orm";
import type { Platform } from "@/lib/platforms";
import type { DirectionId, WritingControls } from "@/lib/writing";
import { generateFromFacts } from "@/server/ai/content-generator";
import type { VoiceProfile } from "@/server/ai/prompt-builder";
import { db } from "@/server/db";
import { workspaces, type ExtractedField } from "@/server/db/schema";
import { getDocument, requestExtraction, reviewExtraction, uploadDocument } from "@/server/documents/service";
import { AppError, badRequest, conflict } from "@/server/errors";
import { getMedia } from "@/server/media/service";
import { DOCUMENT_TYPES } from "@/server/media/validate";
import { storage } from "@/server/storage";

/**
 * "Upload a file, get a post": reads a photo or PDF the user attached in Create post (certificate,
 * poster, letter…) with the document pipeline, then writes platform versions from the facts it
 * found. The facts are shown in the main content box so the user can see and fix what was read.
 */

type Ctx = { workspaceId: string; userId: string; correlationId: string; req?: Request };

/** The writing style that fits each kind of document best. */
const DIRECTION_FOR: Record<string, DirectionId> = {
  certificate: "certificate",
  internship_letter: "certificate",
  achievement: "story",
  competition_result: "story",
  workshop: "story",
  event_poster: "event_promotion",
  project_summary: "technical_update",
  other: "announcement",
};

async function assertConsent(workspaceId: string) {
  const [w] = await db.select({ consent: workspaces.aiProcessingConsentAt }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!w?.consent) throw conflict("Reading files with AI is turned off for this workspace. Turn on AI processing in Settings to use it.");
}

/** Start reading an attached photo (media). Returns the document that tracks the reading. */
export async function readMedia(ctx: Ctx, mediaId: string) {
  await assertConsent(ctx.workspaceId);
  const m = await getMedia(ctx.workspaceId, mediaId);
  if (!(DOCUMENT_TYPES as readonly string[]).includes(m.mimeType)) throw badRequest("Only photos (JPEG, PNG or WebP) and PDFs can be read. Videos and GIFs can't.");
  const data = await storage().get(m.storageKey);
  const file = new File([new Uint8Array(data)], m.originalFilename, { type: m.mimeType });
  const doc = await uploadDocument({ workspaceId: ctx.workspaceId, userId: ctx.userId, file, consent: true, req: ctx.req, correlationId: ctx.correlationId });
  await requestExtraction({ workspaceId: ctx.workspaceId, userId: ctx.userId, documentId: doc.id, correlationId: ctx.correlationId });
  return { documentId: doc.id };
}

/**
 * Once the file is read, write the post. Facts are accepted as read (the user sees them in the main
 * content box and can edit them); nothing is saved until the user saves or publishes.
 */
export async function writeFromDocument(ctx: Ctx, documentId: string, input: { platforms: Platform[]; controls: WritingControls; voice?: VoiceProfile | null }) {
  await assertConsent(ctx.workspaceId);
  const doc = await getDocument(ctx.workspaceId, documentId);
  if (doc.status === "uploaded" || doc.status === "processing") throw new AppError(409, "still_reading", "Still reading the file. Try again in a moment.");
  if (doc.status === "failed" || !doc.extraction) throw badRequest(doc.error ?? "The file couldn't be read. Try a clearer photo, or write the post yourself.");
  const ex = doc.extraction;
  let fields: ExtractedField[] = ex.reviewedFields ?? ex.fields;
  if (!ex.reviewedFields) {
    const reviewed = await reviewExtraction({ workspaceId: ctx.workspaceId, userId: ctx.userId, documentId, review: { fields: ex.fields, userClaims: ex.userClaims ?? null } });
    fields = reviewed.fields;
  }
  if (!fields.length) throw badRequest("No details could be found in this file. Try a clearer photo, or write the post yourself.");

  const direction = DIRECTION_FOR[ex.documentType] ?? "announcement";
  const result = await generateFromFacts(
    { ...ctx, documentId },
    { fields, userClaims: ex.userClaims, documentType: ex.documentType, direction, platforms: input.platforms, controls: input.controls, voice: input.voice },
  );
  const titleField = fields.find((f) => /title|name|event|course/i.test(f.key));
  return {
    documentId,
    documentType: ex.documentType,
    title: (titleField?.value ?? doc.originalFilename.replace(/\.[a-z0-9]+$/i, "")).slice(0, 120),
    // What was read, as plain lines the user can check and correct.
    body: [ex.summary, ...fields.filter((f) => f.key !== "full_text").map((f) => `${f.label}: ${f.value}`)].filter(Boolean).join("\n"),
    facts: fields.filter((f) => f.key !== "full_text").map((f) => ({ label: f.label, value: f.value, confidence: f.confidence })),
    warnings: ex.warnings,
    ...result,
  };
}
