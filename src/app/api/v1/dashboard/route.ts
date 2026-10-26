import { dashboardData } from "@/server/dashboard/service";
import { apiRoute } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ workspace }) => dashboardData(workspace.id));
