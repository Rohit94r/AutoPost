import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { EMOJI, FORMALITY, HASHTAG_PREF, PERSPECTIVES, TONES, type WritingControls } from "@/lib/writing";
import type { VoiceProfile } from "@/server/ai/prompt-builder";
import { db } from "@/server/db";
import { brandProfiles } from "@/server/db/schema";
import { badRequest, notFound } from "@/server/errors";

const list = (max: number, len = 120) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);

export const brandInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullish(),
  audience: z.string().trim().max(300).nullish(),
  industry: z.string().trim().max(100).nullish(),
  tone: z.enum(TONES).default("conversational"),
  writingStyle: z.string().trim().max(1000).nullish(),
  language: z.string().trim().max(40).default("English"),
  perspective: z.enum(PERSPECTIVES).default("first_person"),
  formality: z.enum(FORMALITY).default("neutral"),
  vocabulary: list(50, 80),
  avoidPhrases: list(50, 80),
  preferredCtas: list(10, 200),
  hashtagPreference: z.enum(HASHTAG_PREF).default("minimal"),
  emojiPreference: z.enum(EMOJI).default("minimal"),
  examplePosts: list(10, 4000),
  isDefault: z.boolean().default(false),
});

export type BrandRow = typeof brandProfiles.$inferSelect;

export const listBrands = (workspaceId: string) =>
  db.select().from(brandProfiles).where(eq(brandProfiles.workspaceId, workspaceId)).orderBy(asc(brandProfiles.createdAt));

export async function getBrand(workspaceId: string, id: string) {
  const [b] = await db.select().from(brandProfiles).where(and(eq(brandProfiles.id, id), eq(brandProfiles.workspaceId, workspaceId)));
  if (!b) throw notFound("Brand profile");
  return b;
}

export async function getDefaultBrand(workspaceId: string) {
  const all = await listBrands(workspaceId);
  return all.find((b) => b.isDefault) ?? all[0] ?? null;
}

export async function saveBrand(workspaceId: string, input: z.infer<typeof brandInput>, id?: string) {
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(brandProfiles).set({ isDefault: false }).where(eq(brandProfiles.workspaceId, workspaceId));
    if (id) {
      const [row] = await tx.update(brandProfiles).set(input).where(and(eq(brandProfiles.id, id), eq(brandProfiles.workspaceId, workspaceId))).returning();
      if (!row) throw notFound("Brand profile");
      return row;
    }
    const [row] = await tx.insert(brandProfiles).values({ ...input, workspaceId }).returning();
    return row!;
  });
}

export async function deleteBrand(workspaceId: string, id: string) {
  const all = await listBrands(workspaceId);
  if (all.length <= 1) throw badRequest("Keep at least one brand profile.");
  const target = all.find((b) => b.id === id);
  if (!target) throw notFound("Brand profile");
  await db.delete(brandProfiles).where(eq(brandProfiles.id, id));
  if (target.isDefault) {
    const next = all.find((b) => b.id !== id)!;
    await db.update(brandProfiles).set({ isDefault: true }).where(eq(brandProfiles.id, next.id));
  }
}

export function toVoice(b: BrandRow | null): VoiceProfile | null {
  if (!b) return null;
  return {
    name: b.name,
    description: b.description,
    audience: b.audience,
    industry: b.industry,
    writingStyle: b.writingStyle,
    vocabulary: b.vocabulary,
    avoidPhrases: b.avoidPhrases,
    preferredCtas: b.preferredCtas,
    derivedStyle: b.derivedStyle,
  };
}

/** Brand defaults fill any control the request didn't set explicitly. */
export function controlsFromBrand(b: BrandRow | null, partial: Partial<WritingControls>): Partial<WritingControls> {
  if (!b) return partial;
  return {
    tone: (b.tone as WritingControls["tone"]) ?? undefined,
    perspective: b.perspective as WritingControls["perspective"],
    formality: b.formality as WritingControls["formality"],
    emoji: b.emojiPreference as WritingControls["emoji"],
    hashtags: b.hashtagPreference as WritingControls["hashtags"],
    language: b.language,
    audience: b.audience ?? undefined,
    ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)),
  };
}
