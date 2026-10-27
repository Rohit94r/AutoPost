import { z } from "zod";
import { platformListSchema } from "@/lib/writing";
import { aiBase, resolveVoice } from "@/server/ai/request-context";
import { writeFromDocument } from "@/server/autofill/service";
import { apiRoute, parseJson } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/rate-limit";

export const maxDuration = 300;

const body = aiBase.extend({ documentId: z.string().uuid(), platforms: platformListSchema });

/** Write platform versions from a file that has been read. Nothing is saved; the composer fills itself. */
export const POST = apiRoute({ rateLimit: RATE_LIMITS.ai }, async ({ req, user, workspace, correlationId }) => {
  const input = await parseJson(req, body);
  const { controls, voice } = await resolveVoice(workspace.id, input);
  return writeFromDocument({ workspaceId: workspace.id, userId: user.id, correlationId, req }, input.documentId, { platforms: input.platforms, controls, voice });
});
