import { apiRoute } from "@/server/http/handler";
import { listNotifications, markAllRead } from "@/server/notifications/service";

export const GET = apiRoute({}, async ({ user, workspace }) => {
  const items = await listNotifications(user.id, workspace.id);
  return { notifications: items, unread: items.filter((n) => !n.readAt).length };
});

export const POST = apiRoute({ role: "viewer" }, async ({ user, workspace }) => {
  await markAllRead(user.id, workspace.id);
  return { ok: true };
});
