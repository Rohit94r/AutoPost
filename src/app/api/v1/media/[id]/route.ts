import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { mediaAssets } from "@/server/db/schema";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { deleteMedia, getMedia, serializeMedia } from "@/server/media/service";

type P = { id: string };

export const PATCH = apiRoute<P>({}, async ({ req, params, workspace }) => {
  const m = await getMedia(workspace.id, uuidParam(params.id));
  const { altText } = await parseJson(req, z.object({ altText: z.string().trim().max(1000) }));
  const [row] = await db.update(mediaAssets).set({ altText: altText || null }).where(eq(mediaAssets.id, m.id)).returning();
  return { media: serializeMedia(row!) };
});

export const DELETE = apiRoute<P>({}, async ({ req, params, user, workspace }) => {
  await deleteMedia({ workspaceId: workspace.id, userId: user.id, id: uuidParam(params.id), req });
  return { ok: true };
});
