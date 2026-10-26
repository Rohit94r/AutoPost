import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { PLATFORM_META, platformLimits, textLength, type Platform } from "@/lib/platforms";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { controlsBlock, fence, systemPrompt, type VoiceProfile } from "./prompt-builder";
import { parseRoute } from "./registry";
import { runTask, toAppError } from "./service";
import { AIError } from "./types";
import { writingControlsSchema } from "@/lib/writing";

interface Ctx {
  workspaceId: string;
  userId?: string | null;
  correlationId: string;
}

/* ───────────────────────── Comment replies ───────────────────────── */

export const replyOutput = z.object({
  shouldReply: z.boolean(),
  sentiment: z.enum(["positive", "neutral", "question", "negative", "abusive", "spam"]),
  reply: z.string().max(1500).default(""),
  reason: z.string().max(300).default(""),
});
export type ReplyDecision = z.infer<typeof replyOutput>;

/** Room left for the reply on each platform (Mastodon/Bluesky mentions eat into it). */
function replyLimit(platform: Platform) {
  const max = platformLimits(platform).maxChars;
  return Math.min(platform === "x" ? 260 : platform === "bluesky" ? 280 : 600, max - 20);
}

/**
 * Drafts a short, human reply to a comment or mention and classifies it so autopilot can skip
 * spam, abuse and sensitive negativity (those always go to a human).
 */
export async function draftReply(
  ctx: Ctx,
  input: {
    platform: Platform;
    comment: string;
    authorName?: string | null;
    postText?: string | null;
    instructions?: string | null;
    voice?: VoiceProfile | null;
    previousReplies?: string[];
  },
): Promise<ReplyDecision & { provider: string; model: string }> {
  const limit = replyLimit(input.platform);
  const system = systemPrompt(
    `You reply to comments on the author's ${PLATFORM_META[input.platform].label} posts, as the author. Sound like a real, warm person: brief, specific to what the commenter said, no corporate tone, no hashtags, at most one emoji and only if it fits. Never invent facts, offers, prices, dates or promises. Never ask people to DM unless the instructions say so. Don't argue. For spam, scams, abuse or hate: shouldReply=false. For complaints or sensitive topics: write a calm, empathetic draft but mark sentiment negative.`,
  );
  const user = [
    controlsBlock(writingControlsSchema.parse({ length: "short", emoji: "minimal", hashtags: "none" }), input.voice),
    input.instructions ? `Owner's instructions for replies:\n${fence("instructions", input.instructions, 2000)}` : "",
    input.postText ? `The post being commented on:\n${fence("post", input.postText, 3000)}` : "",
    `Comment${input.authorName ? ` from ${input.authorName.slice(0, 80)}` : ""}:\n${fence("comment", input.comment, 2000)}`,
    input.previousReplies?.length ? `Recent replies already sent (don't repeat their wording):\n${fence("previous", input.previousReplies.slice(0, 5).join("\n---\n"), 2000)}` : "",
    `Keep the reply under ${limit} characters. Return JSON {"shouldReply":true|false,"sentiment":"positive|neutral|question|negative|abusive|spam","reply":"...","reason":"short explanation"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await runTask({ ...ctx, task: "reply", system, parts: [{ type: "text", text: user }], schema: replyOutput, schemaName: "reply", temperature: 0.7 });
  let reply = res.data.reply.trim().replace(/^["“]|["”]$/g, "");
  if (textLength(input.platform, reply) > limit) reply = reply.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
  return { ...res.data, reply, provider: res.provider, model: res.model };
}

/* ───────────────────────── Brand autofill ───────────────────────── */

export const brandAutofillOutput = z.object({
  name: z.string().max(100),
  description: z.string().max(1000),
  audience: z.string().max(300),
  industry: z.string().max(100),
  tone: z.enum(["professional", "conversational", "enthusiastic", "reflective", "educational", "technical", "persuasive"]),
  writingStyle: z.string().max(800),
  vocabulary: z.array(z.string().max(80)).max(15),
  avoidPhrases: z.array(z.string().max(80)).max(15),
  preferredCtas: z.array(z.string().max(160)).max(5),
});

/** Turns one plain-language description into a complete brand voice profile (user reviews it before saving). */
export async function autofillBrand(ctx: Ctx, input: { description: string }) {
  const system = systemPrompt(
    "You set up a brand/creator voice profile from the owner's own description. Only use what they said; leave a field short rather than inventing credentials or claims.",
  );
  const user = `Owner's description:\n${fence("description", input.description, 3000)}\n\nReturn JSON {"name","description","audience","industry","tone","writingStyle","vocabulary":[],"avoidPhrases":[],"preferredCtas":[]}. avoidPhrases should list generic clichés this voice would never use.`;
  const res = await runTask({ ...ctx, task: "voice", system, parts: [{ type: "text", text: user }], schema: brandAutofillOutput, schemaName: "brand_profile", temperature: 0.4 });
  return { profile: res.data, provider: res.provider, model: res.model };
}

/* ───────────────────────── Image prompter ───────────────────────── */

export const imagePromptOutput = z.object({
  prompt: z.string().max(2000),
  negativePrompt: z.string().max(500).default(""),
  altText: z.string().max(500),
  aspectRatio: z.enum(["1:1", "4:5", "16:9", "9:16"]),
});

/** Writes an image-generation prompt (and alt text) that matches a post. */
export async function imagePrompt(ctx: Ctx, input: { text: string; style?: string; platform?: Platform }) {
  const aspect = input.platform === "instagram" ? "4:5" : input.platform === "pinterest" ? "9:16" : input.platform === "youtube" ? "16:9" : "1:1";
  const system = systemPrompt(
    "You write prompts for an image generator to illustrate a social post. Describe a concrete scene, composition, lighting and style. No text, logos, watermarks or real people's likeness in the image. Never depict fake certificates, awards or documents.",
  );
  const user = `Post:\n${fence("post", input.text, 4000)}\n${input.style ? `Preferred style: ${input.style.slice(0, 200)}\n` : ""}Suggested aspect ratio: ${aspect}.\nReturn JSON {"prompt","negativePrompt","altText","aspectRatio"}.`;
  const res = await runTask({ ...ctx, task: "draft", system, parts: [{ type: "text", text: user }], schema: imagePromptOutput, schemaName: "image_prompt", temperature: 0.8 });
  return { ...res.data, provider: res.provider, model: res.model };
}

export const imageGenerationConfigured = () => Boolean(parseRoute(env().AI_MODEL_IMAGE)?.provider === "gemini" && env().GEMINI_API_KEY);

/** Generates an image with the configured Gemini image model. Returns raw bytes for the media library. */
export async function generateImage(input: { prompt: string; aspectRatio: string }): Promise<{ data: Buffer; mimeType: string; model: string }> {
  const route = parseRoute(env().AI_MODEL_IMAGE);
  const key = env().GEMINI_API_KEY;
  if (!route || route.provider !== "gemini" || !key) {
    throw new AppError(503, "ai_not_configured", "Image generation isn't configured. Set AI_MODEL_IMAGE=gemini:<image model> and GEMINI_API_KEY.");
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: route.model,
      contents: [{ role: "user", parts: [{ text: `${input.prompt}\n\nAspect ratio ${input.aspectRatio}. No text or watermarks.` }] }],
      config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: input.aspectRatio }, abortSignal: AbortSignal.timeout(120_000) } as never,
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new AIError("invalid_output", "The image model didn't return an image.", false, "gemini");
    return { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "image/png", model: route.model };
  } catch (err) {
    throw toAppError(err instanceof AIError ? err : new AIError("provider_error", String((err as Error)?.message ?? err).slice(0, 200), false, "gemini"));
  }
}
