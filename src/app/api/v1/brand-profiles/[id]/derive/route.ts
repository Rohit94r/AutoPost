import { eq } from "drizzle-orm";
import { deriveVoice } from "@/server/ai/content-generator";
import { getBrand } from "@/server/brand/service";
import { db } from "@/server/db";
import { brandProfiles } from "@/server/db/schema";
import { badRequest } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

/** Analyse the profile's sample posts into a derived style (style description, not copied text). */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.ai }, async ({ params, user, workspace, correlationId }) => {
  const brand = await getBrand(workspace.id, uuidParam(params.id));
  const samples = brand.examplePosts.filter((s) => s.trim().length > 40);
  if (samples.length < 2) throw badRequest("Add at least two example posts (40+ characters each) to derive a writing style.");
  const { style, provider, model } = await deriveVoice({ workspaceId: workspace.id, userId: user.id, correlationId }, { samples });
  const [profile] = await db.update(brandProfiles).set({ derivedStyle: style }).where(eq(brandProfiles.id, brand.id)).returning();
  return { profile, provider, model };
});
