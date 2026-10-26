import "server-only";
import { composeFinalText, type Platform } from "@/lib/platforms";
import { checkQuality } from "@/lib/quality";
import { CONTENT_DIRECTIONS, type DirectionId, type WritingControls } from "@/lib/writing";
import type { ExtractedField } from "@/server/db/schema";
import { env } from "@/server/env";
import { controlsBlock, factsBlock, fence, platformGuidance, platformNames, systemPrompt, type VoiceProfile } from "./prompt-builder";
import { critiqueOutput, directionsOutput, hashtagsOutput, rewriteOutput, variantsOutput, voiceOutput } from "./schemas";
import { runTask } from "./service";

/**
 * ContentGenerator / ContentRewriter / PlatformAdapter (AI) — task-level functions used by the API.
 * Every output is quality-checked against its source so unsupported figures are flagged.
 */

interface Ctx {
  workspaceId: string;
  userId: string;
  correlationId: string;
  contentId?: string | null;
  documentId?: string | null;
}

const LENGTH_TEMP = { short: 0.6, medium: 0.7, long: 0.75 } as const;

function withQuality(platform: Platform, text: string, hashtags: string[], source: string, controls: WritingControls) {
  const final = composeFinalText(text, hashtags);
  const report = checkQuality({
    text: final,
    platform,
    sourceText: source,
    avoidPhrases: controls.avoid,
    emoji: controls.emoji,
    hashtags: controls.hashtags,
    mediaCount: platform === "instagram" ? 1 : 0, // media presence is validated in the composer
    xMaxLength: env().X_MAX_POST_LENGTH,
  });
  return { platform, text, hashtags, issues: report.issues.filter((i) => i.code !== "media_required") };
}

/** Generate platform-specific variants from an idea or draft. */
export async function generateVariants(
  ctx: Ctx,
  input: { idea: string; platforms: Platform[]; controls: WritingControls; voice?: VoiceProfile | null; link?: string | null },
) {
  const system = systemPrompt(
    `You are an expert social media writer. Turn the author's idea into separate, natively-written posts for: ${platformNames(input.platforms)}. Each platform must get its own structure and length; do not duplicate the same caption.`,
  );
  const user = [
    controlsBlock(input.controls, input.voice),
    `Platform guidance:\n${platformGuidance(input.platforms)}`,
    input.link ? `Link to reference where natural: ${input.link}` : "",
    `The author's idea/draft (all facts must come from here):\n${fence("idea", input.idea, 8000)}`,
    `Return JSON {"variants":[{"platform":"linkedin|instagram|x","text":"post body WITHOUT trailing hashtags","hashtags":["tag"]}],"notes":"optional short note about missing info"} with exactly one variant per requested platform.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await runTask({
    ...ctx,
    task: "draft",
    system,
    parts: [{ type: "text", text: user }],
    schema: variantsOutput,
    schemaName: "variants",
    temperature: LENGTH_TEMP[input.controls.length],
  });
  const variants = input.platforms.map((p) => {
    const v = res.data.variants.find((x) => x.platform === p);
    return withQuality(p, v?.text ?? "", v?.hashtags ?? [], `${input.idea} ${input.link ?? ""}`, input.controls);
  });
  return { variants, notes: res.data.notes ?? null, provider: res.provider, model: res.model };
}

/** Adapt an existing master text into platform variants, preserving meaning and facts. */
export async function adaptToPlatforms(
  ctx: Ctx,
  input: { text: string; platforms: Platform[]; controls: WritingControls; voice?: VoiceProfile | null },
) {
  const system = systemPrompt(
    `You adapt an existing post for different platforms. Keep the core facts, intent and meaning identical; change only structure, length, tone and format to fit each platform.`,
  );
  const user = [
    controlsBlock(input.controls, input.voice),
    `Platform guidance:\n${platformGuidance(input.platforms)}`,
    `Original post:\n${fence("original_post", input.text, 8000)}`,
    `Return JSON {"variants":[{"platform":"...","text":"...","hashtags":["..."]}]} with one variant per platform: ${input.platforms.join(", ")}.`,
  ].join("\n\n");
  const res = await runTask({ ...ctx, task: "adapt", system, parts: [{ type: "text", text: user }], schema: variantsOutput, schemaName: "variants", temperature: 0.6 });
  const variants = input.platforms.map((p) => {
    const v = res.data.variants.find((x) => x.platform === p);
    return withQuality(p, v?.text ?? "", v?.hashtags ?? [], input.text, input.controls);
  });
  return { variants, provider: res.provider, model: res.model };
}

const OP_INSTRUCTIONS = {
  improve: "Improve clarity, flow and specificity while keeping the author's voice and every fact.",
  rewrite: "Rewrite with fresh wording and structure, same meaning and facts.",
  shorten: "Make it noticeably shorter (about half) while keeping the key message and facts.",
  expand: "Expand with more context and explanation drawn ONLY from what is already stated — do not add new facts, examples or claims.",
  tone: "Rewrite in the requested tone, keeping meaning and facts.",
  simplify: "Use simpler words and shorter sentences for a broad audience.",
  fix_grammar: "Fix grammar, spelling and punctuation only. Change as little as possible.",
} as const;

export async function rewriteText(
  ctx: Ctx,
  input: { text: string; operation: keyof typeof OP_INSTRUCTIONS; platform?: Platform; controls: WritingControls; voice?: VoiceProfile | null },
) {
  const system = systemPrompt("You are a careful editor who rewrites social posts on request.");
  const user = [
    `Task: ${OP_INSTRUCTIONS[input.operation]}`,
    controlsBlock(input.controls, input.voice),
    input.platform ? `Target platform guidance:\n${platformGuidance([input.platform])}` : "",
    `Text to edit:\n${fence("draft", input.text, 8000)}`,
    `Return JSON {"text":"edited text","changes":["short description of each notable change"]}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await runTask({ ...ctx, task: "rewrite", system, parts: [{ type: "text", text: user }], schema: rewriteOutput, schemaName: "rewrite", temperature: input.operation === "fix_grammar" ? 0.2 : 0.7 });
  const quality = input.platform
    ? checkQuality({ text: res.data.text, platform: input.platform, sourceText: input.text, avoidPhrases: input.controls.avoid, emoji: input.controls.emoji, xMaxLength: env().X_MAX_POST_LENGTH }).issues.filter((i) => i.code !== "media_required")
    : [];
  return { before: input.text, after: res.data.text, changes: res.data.changes, issues: quality, provider: res.provider, model: res.model };
}

export async function suggestHashtags(ctx: Ctx, input: { text: string; platform: Platform; count: number }) {
  const system = systemPrompt("You suggest relevant, specific hashtags. Prefer niche and descriptive tags over generic ones like #success or #motivation.");
  const user = `Suggest up to ${input.count} hashtags for this ${input.platform} post. No # symbol, no spaces inside tags.\n${fence("post", input.text, 6000)}\nReturn JSON {"hashtags":["tag"]}.`;
  const res = await runTask({ ...ctx, task: "hashtags", system, parts: [{ type: "text", text: user }], schema: hashtagsOutput, schemaName: "hashtags", temperature: 0.5 });
  const clean = [...new Set(res.data.hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean))].slice(0, input.count);
  return { hashtags: clean, provider: res.provider, model: res.model };
}

/** Several content directions from reviewed document facts. */
export async function generateDirections(
  ctx: Ctx,
  input: { fields: ExtractedField[]; userClaims?: string | null; documentType: string; controls: WritingControls; voice?: VoiceProfile | null },
) {
  const options = CONTENT_DIRECTIONS.map((d) => `${d.id}: ${d.label}`).join("; ");
  const system = systemPrompt(
    "You propose content directions for a social post based ONLY on verified facts from a document the user reviewed. Never claim the document is verified or authentic.",
  );
  const user = [
    `Document type: ${input.documentType}.`,
    controlsBlock(input.controls, input.voice),
    factsBlock(input.fields, input.userClaims),
    `Propose 3–5 of the most suitable directions from: ${options}. For each, give a one-sentence angle and a short sample opening (2–3 sentences) that uses only the facts above.`,
    `Return JSON {"directions":[{"id":"direction id","title":"label","angle":"...","sample":"..."}]}.`,
  ].join("\n\n");
  const res = await runTask({ ...ctx, task: "draft", system, parts: [{ type: "text", text: user }], schema: directionsOutput, schemaName: "directions", temperature: 0.8 });
  return { directions: res.data.directions, provider: res.provider, model: res.model };
}

/** Platform drafts from reviewed facts in a chosen direction. */
export async function generateFromFacts(
  ctx: Ctx,
  input: {
    fields: ExtractedField[];
    userClaims?: string | null;
    documentType: string;
    direction: DirectionId | string;
    platforms: Platform[];
    controls: WritingControls;
    voice?: VoiceProfile | null;
  },
) {
  const label = CONTENT_DIRECTIONS.find((d) => d.id === input.direction)?.label ?? input.direction;
  const system = systemPrompt(
    `You write social posts from facts the user extracted from a ${input.documentType.replace(/_/g, " ")} and reviewed. Style: ${label}. Use ONLY the listed facts; if something (like a date or score) is not listed, do not mention it. Never claim the document was verified or is authentic.`,
  );
  const user = [
    controlsBlock(input.controls, input.voice),
    `Platform guidance:\n${platformGuidance(input.platforms)}`,
    factsBlock(input.fields, input.userClaims),
    `Return JSON {"variants":[{"platform":"...","text":"...","hashtags":["..."]}],"notes":"mention any fact you deliberately left out"} with one variant per platform: ${input.platforms.join(", ")}.`,
  ].join("\n\n");
  const res = await runTask({ ...ctx, task: "draft", system, parts: [{ type: "text", text: user }], schema: variantsOutput, schemaName: "variants", temperature: 0.7 });
  const source = [...input.fields.map((f) => `${f.label} ${f.value}`), input.userClaims ?? ""].join("\n");
  const variants = input.platforms.map((p) => {
    const v = res.data.variants.find((x) => x.platform === p);
    return withQuality(p, v?.text ?? "", v?.hashtags ?? [], source, input.controls);
  });
  return { variants, notes: res.data.notes ?? null, provider: res.provider, model: res.model };
}

export async function critiqueText(ctx: Ctx, input: { text: string; platform: Platform; source?: string }) {
  const system = systemPrompt(
    "You are a strict editor. Critique the post for clarity, specificity, naturalness, clichés, exaggeration and claims not supported by the source. Do not rewrite it.",
  );
  const user = [
    `Platform: ${input.platform}.`,
    input.source ? `Source facts:\n${fence("source", input.source, 8000)}` : "",
    `Post:\n${fence("post", input.text, 8000)}`,
    `Return JSON {"score":0-10,"issues":[{"severity":"high|medium|low","message":"...","quote":"optional excerpt"}]}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await runTask({ ...ctx, task: "critique", system, parts: [{ type: "text", text: user }], schema: critiqueOutput, schemaName: "critique", temperature: 0.2 });
  return { ...res.data, provider: res.provider, model: res.model };
}

/** Derive a style profile from user-supplied sample posts (analysed, never copied). */
export async function deriveVoice(ctx: Ctx, input: { samples: string[] }) {
  const system = systemPrompt(
    "You analyse writing samples supplied by the user to describe their style (sentence length, tone, structure, recurring habits). Describe the style; do not copy sentences.",
  );
  const user = `${input.samples.map((s, i) => fence(`sample_${i + 1}`, s, 4000)).join("\n\n")}\n\nReturn JSON {"summary":"2-3 sentences","sentenceLength":"...","traits":["..."],"signaturePhrases":["short recurring phrases, max 4 words each"],"avoid":["habits that would feel off-brand"]}.`;
  const res = await runTask({ ...ctx, task: "voice", system, parts: [{ type: "text", text: user }], schema: voiceOutput, schemaName: "voice", temperature: 0.3 });
  return { style: { ...res.data, derivedAt: new Date().toISOString() }, provider: res.provider, model: res.model };
}
