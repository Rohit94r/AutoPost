import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { generateImage, imageGenerationConfigured, imagePrompt } from "@/server/ai/engagement-ai";
import { badRequest } from "@/server/errors";
import { apiRoute, parseJson } from "@/server/http/handler";
import { saveGeneratedMedia } from "@/server/media/service";
import { RATE_LIMITS } from "@/server/rate-limit";
import { assertQuota, recordUsage } from "@/server/usage/service";

const body = z.object({
  text: z.string().trim().max(6000).optional(),
  prompt: z.string().trim().max(2000).optional(),
  style: z.string().max(200).optional(),
  platform: z.enum(PLATFORMS).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "16:9", "9:16"]).optional(),
  generate: z.boolean().default(false),
});

/**
 * Image prompter. Without `generate`: writes an image prompt + alt text for a post.
 * With `generate` (and AI_MODEL_IMAGE configured): renders the image and saves it to the media library.
 */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  const ctx = { workspaceId: workspace.id, userId: user.id, correlationId };
  let prompt = input.prompt;
  let altText = "";
  let aspectRatio = input.aspectRatio ?? "1:1";
  if (!prompt) {
    if (!input.text) throw badRequest("Write the post (or an image idea) first.");
    const p = await imagePrompt(ctx, { text: input.text, style: input.style, platform: input.platform });
    prompt = p.prompt;
    altText = p.altText;
    aspectRatio = input.aspectRatio ?? p.aspectRatio;
  }
  if (!input.generate) return { prompt, altText, aspectRatio, canGenerate: imageGenerationConfigured() };
  await assertQuota(workspace.id, "ai");
  const img = await generateImage({ prompt, aspectRatio });
  await recordUsage({ workspaceId: workspace.id, userId: user.id, metric: "ai_request", quantity: 1, metadata: { task: "image", model: img.model } });
  const media = await saveGeneratedMedia({ workspaceId: workspace.id, userId: user.id, data: img.data, mimeType: img.mimeType, altText: altText || prompt.slice(0, 300) });
  return { prompt, altText, aspectRatio, canGenerate: true, media };
});
