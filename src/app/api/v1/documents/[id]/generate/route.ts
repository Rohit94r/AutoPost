import { NextResponse } from "next/server";
import { z } from "zod";
import { platformListSchema } from "@/lib/writing";
import { generateFromFacts } from "@/server/ai/content-generator";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { createContent } from "@/server/content/service";
import { getDocument } from "@/server/documents/service";
import { conflict } from "@/server/errors";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

const body = aiBase.extend({ direction: z.string().max(40), platforms: platformListSchema, title: z.string().max(200).optional() });

/** Generate platform drafts from reviewed facts and save them as a new editable draft. */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.ai }, async ({ req, params, user, workspace, correlationId }) => {
  const id = uuidParam(params.id);
  const input = await parseJson(req, body);
  const doc = await getDocument(workspace.id, id);
  const ex = doc.extraction;
  if (!ex?.reviewedFields) throw conflict("Review and confirm the extracted facts first.");
  const { controls, voice, brandId } = await resolveVoice(workspace.id, input);
  const result = await generateFromFacts(
    { workspaceId: workspace.id, userId: user.id, correlationId, documentId: id },
    { fields: ex.reviewedFields, userClaims: ex.userClaims, documentType: ex.documentType, direction: input.direction, platforms: input.platforms, controls, voice },
  );
  const first = result.variants.find((v) => v.text) ?? result.variants[0];
  const titleField = ex.reviewedFields.find((f) => /title|name/.test(f.key));
  const content = await createContent(
    { workspaceId: workspace.id, userId: user.id },
    {
      title: input.title ?? (titleField ? `${titleField.value}`.slice(0, 200) : doc.originalFilename),
      body: first?.text ?? "",
      hashtags: [],
      tags: ["from-document"],
      aiGenerated: true,
      isTemplate: false,
      brandProfileId: brandId,
      sourceDocumentId: id,
      mediaIds: [],
      variants: result.variants.map((v) => ({ platform: v.platform, body: v.text, hashtags: v.hashtags, includeMedia: true, aiGenerated: true })),
    },
  );
  return NextResponse.json({ contentId: content.id, ...result }, { status: 201 });
});
