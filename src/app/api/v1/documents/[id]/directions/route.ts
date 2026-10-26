import { generateDirections } from "@/server/ai/content-generator";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { getDocument } from "@/server/documents/service";
import { conflict } from "@/server/errors";
import { apiRoute, parseJson, uuidParam } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

/** Content directions from REVIEWED facts only. */
export const POST = apiRoute<{ id: string }>({ rateLimit: RATE_LIMITS.ai }, async ({ req, params, user, workspace, correlationId }) => {
  const id = uuidParam(params.id);
  const input = await parseJson(req, aiBase);
  const doc = await getDocument(workspace.id, id);
  const ex = doc.extraction;
  if (!ex?.reviewedFields) throw conflict("Review and confirm the extracted facts first.");
  const { controls, voice } = await resolveVoice(workspace.id, input);
  return generateDirections(
    { workspaceId: workspace.id, userId: user.id, correlationId, documentId: id },
    { fields: ex.reviewedFields, userClaims: ex.userClaims, documentType: ex.documentType, controls, voice },
  );
});
