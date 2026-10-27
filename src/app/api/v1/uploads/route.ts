import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";
import { startUpload, startUploadInput } from "@/server/uploads/service";

/** Step 1 of an upload: returns a signed URL for a direct browser-to-storage upload, or { direct: false }. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.upload }, async ({ req, workspace }) => startUpload(workspace.id, await parseJson(req, startUploadInput)));
