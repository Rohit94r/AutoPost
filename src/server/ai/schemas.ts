import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";

/** Structured output contracts. Every AI response is validated against one of these. */

export const variantsOutput = z.object({
  variants: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        text: z.string().min(1).max(6000),
        hashtags: z.array(z.string().max(60)).max(30).default([]),
      }),
    )
    .min(1),
  notes: z.string().max(600).optional(),
});
export type VariantsOutput = z.infer<typeof variantsOutput>;

export const rewriteOutput = z.object({
  text: z.string().min(1).max(8000),
  changes: z.array(z.string().max(200)).max(8).default([]),
});

export const hashtagsOutput = z.object({
  hashtags: z.array(z.string().min(1).max(60)).max(30),
});

export const directionsOutput = z.object({
  directions: z
    .array(
      z.object({
        id: z.string().max(40),
        title: z.string().max(80),
        angle: z.string().max(300),
        sample: z.string().max(1200),
      }),
    )
    .min(1)
    .max(6),
});
export type DirectionsOutput = z.infer<typeof directionsOutput>;

export const extractionOutput = z.object({
  documentType: z.enum([
    "certificate",
    "achievement",
    "event_poster",
    "workshop",
    "internship_letter",
    "competition_result",
    "project_summary",
    "other",
  ]),
  summary: z.string().max(800),
  fields: z
    .array(
      z.object({
        key: z.string().max(60),
        label: z.string().max(80),
        value: z.string().max(1000),
        confidence: z.enum(["high", "medium", "low"]),
        evidence: z.string().max(400).nullable().optional(),
        page: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(40),
  missing: z.array(z.string().max(80)).max(20).default([]),
  warnings: z.array(z.string().max(300)).max(10).default([]),
  embeddedInstructionsDetected: z.boolean().default(false),
});
export type ExtractionOutput = z.infer<typeof extractionOutput>;

export const voiceOutput = z.object({
  summary: z.string().max(600),
  sentenceLength: z.string().max(120),
  traits: z.array(z.string().max(120)).max(10),
  signaturePhrases: z.array(z.string().max(80)).max(10),
  avoid: z.array(z.string().max(80)).max(10),
});

export const critiqueOutput = z.object({
  score: z.number().min(0).max(10),
  issues: z
    .array(z.object({ severity: z.enum(["high", "medium", "low"]), message: z.string().max(300), quote: z.string().max(300).optional() }))
    .max(12),
});

/** JSON Schema for provider structured-output features (zod v4 native conversion). */
export function jsonSchemaFor(name: string, schema: z.ZodType): { name: string; schema: Record<string, unknown> } {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return { name, schema: json };
}
