import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";

/** Writing controls shared by the composer UI and the AI API (client-safe). */
export const TONES = ["professional", "conversational", "enthusiastic", "reflective", "educational", "technical", "persuasive"] as const;
export const LENGTHS = ["short", "medium", "long"] as const;
export const PERSPECTIVES = ["first_person", "third_person", "brand_we"] as const;
export const FORMALITY = ["casual", "neutral", "formal"] as const;
export const EMOJI = ["none", "minimal", "moderate"] as const;
export const HASHTAG_PREF = ["none", "minimal", "moderate", "generous"] as const;
export const REWRITE_OPS = ["improve", "rewrite", "shorten", "expand", "tone", "simplify", "fix_grammar"] as const;

export const writingControlsSchema = z.object({
  tone: z.enum(TONES).default("conversational"),
  length: z.enum(LENGTHS).default("medium"),
  audience: z.string().max(200).optional(),
  perspective: z.enum(PERSPECTIVES).default("first_person"),
  formality: z.enum(FORMALITY).default("neutral"),
  emoji: z.enum(EMOJI).default("minimal"),
  hashtags: z.enum(HASHTAG_PREF).default("minimal"),
  callToAction: z.string().max(200).optional(),
  language: z.string().max(40).default("English"),
  avoid: z.array(z.string().max(80)).max(50).default([]),
  vocabulary: z.array(z.string().max(80)).max(50).default([]),
});
export type WritingControls = z.infer<typeof writingControlsSchema>;

export const platformListSchema = z.array(z.enum(PLATFORMS)).min(1).max(PLATFORMS.length);

export const TONE_LABEL: Record<(typeof TONES)[number], string> = {
  professional: "Professional",
  conversational: "Conversational",
  enthusiastic: "Enthusiastic",
  reflective: "Reflective",
  educational: "Educational",
  technical: "Technical",
  persuasive: "Persuasive",
};

export const REWRITE_LABEL: Record<(typeof REWRITE_OPS)[number], string> = {
  improve: "Improve writing",
  rewrite: "Rewrite",
  shorten: "Shorten",
  expand: "Expand",
  tone: "Change tone",
  simplify: "Simplify",
  fix_grammar: "Fix grammar",
};

export const CONTENT_DIRECTIONS = [
  { id: "announcement", label: "Professional announcement" },
  { id: "story", label: "Personal achievement story" },
  { id: "short_caption", label: "Short social caption" },
  { id: "technical_update", label: "Technical project update" },
  { id: "event_promotion", label: "Event promotion" },
  { id: "certificate", label: "Internship / certificate announcement" },
] as const;
export type DirectionId = (typeof CONTENT_DIRECTIONS)[number]["id"];
