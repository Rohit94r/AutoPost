import { apiRoute, uuidParam } from "@/server/http/handler";
import { jobAttempts } from "@/server/publishing/service";

export const GET = apiRoute<{ id: string }>({}, async ({ params, workspace }) => ({ attempts: await jobAttempts(workspace.id, uuidParam(params.id)) }));
