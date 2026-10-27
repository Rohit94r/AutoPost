import { apiRoute } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";
import { uploadChunk } from "@/server/uploads/service";

/** Chunked upload part (database storage): POST raw bytes to ?key=…&index=N. Each part stays under Vercel's 4.5 MB limit. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.uploadChunk }, async ({ req, workspace }) => {
  const q = req.nextUrl.searchParams;
  await uploadChunk(workspace.id, q.get("key") ?? "", Number(q.get("index")), Buffer.from(await req.arrayBuffer()));
  return { ok: true };
});
