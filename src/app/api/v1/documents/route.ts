import { NextResponse } from "next/server";
import { listDocuments, requestExtraction, uploadDocument } from "@/server/documents/service";
import { badRequest } from "@/server/errors";
import { apiRoute } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

export const GET = apiRoute({}, async ({ workspace }) => ({ documents: await listDocuments(workspace.id) }));

/** Upload + validate; extraction starts immediately (queued to the worker). */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.upload }, async ({ req, user, workspace, correlationId }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file in the 'file' field.");
  const consent = form?.get("consent") === "true";
  const doc = await uploadDocument({ workspaceId: workspace.id, userId: user.id, file, consent, req, correlationId });
  const { queued } = await requestExtraction({ workspaceId: workspace.id, userId: user.id, documentId: doc.id, correlationId });
  return NextResponse.json({ document: { id: doc.id, status: queued ? "processing" : undefined } }, { status: 201 });
});
