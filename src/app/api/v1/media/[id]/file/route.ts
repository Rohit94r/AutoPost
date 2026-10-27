import { NextResponse } from "next/server";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { getMedia } from "@/server/media/service";
import { storage } from "@/server/storage";

/** Authorised media delivery for the app UI (workspace members only). Streamed, so large videos work on serverless hosts. */
export const GET = apiRoute<{ id: string }>({}, async ({ req, params, workspace }) => {
  const m = await getMedia(workspace.id, uuidParam(params.id));
  const thumb = req.nextUrl.searchParams.get("variant") === "thumb" && m.thumbnailKey;
  const { body, size } = await storage().stream(thumb ? m.thumbnailKey! : m.storageKey);
  return new NextResponse(body, {
    headers: {
      "Content-Type": thumb ? "image/webp" : m.mimeType,
      ...(size !== null ? { "Content-Length": String(size) } : {}),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
