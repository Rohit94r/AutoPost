import { NextResponse } from "next/server";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { getMedia } from "@/server/media/service";
import { storage } from "@/server/storage";

/** Authorised media delivery for the app UI (workspace members only). */
export const GET = apiRoute<{ id: string }>({}, async ({ req, params, workspace }) => {
  const m = await getMedia(workspace.id, uuidParam(params.id));
  const thumb = req.nextUrl.searchParams.get("variant") === "thumb" && m.thumbnailKey;
  const data = await storage().get(thumb ? m.thumbnailKey! : m.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": thumb ? "image/webp" : m.mimeType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
