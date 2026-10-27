import { NextResponse } from "next/server";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";
import { completeUpload, completeUploadInput } from "@/server/uploads/service";

// Large videos are read back from storage and validated here.
export const maxDuration = 300;

/** Step 2: validate the uploaded object and turn it into media or a document. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.upload }, async ({ req, user, workspace, correlationId }) =>
  NextResponse.json(await completeUpload({ workspaceId: workspace.id, userId: user.id, correlationId, req }, await parseJson(req, completeUploadInput)), { status: 201 }),
);
