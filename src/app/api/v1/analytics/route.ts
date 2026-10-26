import { z } from "zod";
import { platformMetrics, publishingSummary } from "@/server/analytics/service";
import { apiRoute, parseQuery } from "@/server/http/handler";

const q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const GET = apiRoute({}, async ({ req, workspace }) => {
  const { days } = parseQuery(req, q);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const [publishing, platforms] = await Promise.all([publishingSummary(workspace.id, from, to), platformMetrics(workspace.id, from, to)]);
  return { range: { from: from.toISOString(), to: to.toISOString(), days }, publishing, platforms };
});
