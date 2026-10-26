import { apiRoute } from "@/server/http/handler";
import { usageSummary } from "@/server/usage/service";

export const GET = apiRoute({}, async ({ workspace }) => usageSummary(workspace.id));
