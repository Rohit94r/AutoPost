import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/server/errors";
import { apiRoute, parseQuery } from "@/server/http/handler";
import { listMedia, uploadMedia } from "@/server/media/service";
import { RATE_LIMITS } from "@/server/rate-limit";

export const GET = apiRoute({}, async ({ req, workspace }) => {
  const q = parseQuery(req, z.object({ kind: z.enum(["image", "video"]).optional() }));
  return { media: await listMedia(workspace.id, q) };
});

export const POST = apiRoute({ rateLimit: RATE_LIMITS.upload }, async ({ req, user, workspace, correlationId }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file in the 'file' field.");
  const altText = form?.get("altText");
  const media = await uploadMedia({ workspaceId: workspace.id, userId: user.id, file, altText: typeof altText === "string" ? altText : undefined, req, correlationId });
  return NextResponse.json({ media }, { status: 201 });
});
