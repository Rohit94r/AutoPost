import { NextResponse, type NextRequest } from "next/server";
import { storage, verifyLocalPublicUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime" };

/**
 * Short-lived, HMAC-signed media URLs for platforms that fetch media themselves (Instagram).
 * Only media/derived objects are served; documents are never reachable here.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = req.nextUrl.searchParams.get("exp") ?? "";
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!/^(media|derived)\/[0-9a-f-]{36}\/[\w.-]+$/.test(key) || !verifyLocalPublicUrl(key, exp, sig)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const { body, size } = await storage().stream(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(body, {
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", ...(size !== null ? { "Content-Length": String(size) } : {}), "Cache-Control": "private, max-age=600" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
