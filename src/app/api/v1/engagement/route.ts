import { inboxCounts, inboxQuery, listInbox } from "@/server/engagement/service";
import { apiRoute, parseQuery } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ req, workspace }) => {
  const [list, counts] = await Promise.all([listInbox(workspace.id, parseQuery(req, inboxQuery)), inboxCounts(workspace.id)]);
  return { ...list, counts };
});
