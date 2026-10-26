import "server-only";
import { z } from "zod";
import { writingControlsSchema } from "@/lib/writing";
import { controlsFromBrand, getBrand, getDefaultBrand, toVoice } from "@/server/brand/service";

export const aiBase = z.object({
  brandProfileId: z.string().uuid().nullish(),
  controls: writingControlsSchema.partial().default({}),
  contentId: z.string().uuid().nullish(),
});

/** Resolve the brand voice (explicit or workspace default) and merge it with request controls. */
export async function resolveVoice(workspaceId: string, input: z.infer<typeof aiBase>) {
  const brand = input.brandProfileId ? await getBrand(workspaceId, input.brandProfileId) : await getDefaultBrand(workspaceId);
  const controls = writingControlsSchema.parse(controlsFromBrand(brand, input.controls));
  return { controls, voice: toVoice(brand), brandId: brand?.id ?? null };
}
