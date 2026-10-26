import { z } from "zod";
import { autofillBrand } from "@/server/ai/engagement-ai";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

/** "Fill with AI": a full brand voice profile from one plain-language description (not saved). */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const { description } = await parseJson(req, z.object({ description: z.string().trim().min(10, "Describe yourself or your brand in a sentence or two").max(3000) }));
  return autofillBrand({ workspaceId: workspace.id, userId: user.id, correlationId }, { description });
});
