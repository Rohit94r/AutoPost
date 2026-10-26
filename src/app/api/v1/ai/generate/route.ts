import { z } from "zod";
import { platformListSchema } from "@/lib/writing";
import { generateVariants } from "@/server/ai/content-generator";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = aiBase.extend({
  idea: z.string().trim().min(3, "Describe your idea in a few words").max(8000),
  platforms: platformListSchema,
  link: z.string().url().nullish(),
});

/** Idea/draft → separate, editable platform variants. Nothing is saved; the client decides. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  const { controls, voice } = await resolveVoice(workspace.id, input);
  return generateVariants(
    { workspaceId: workspace.id, userId: user.id, correlationId, contentId: input.contentId },
    { idea: input.idea, platforms: input.platforms, controls, voice, link: input.link },
  );
});
