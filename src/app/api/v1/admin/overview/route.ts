import { adminOverview, assertAdmin } from "@/server/admin/service";
import { apiRoute } from "@/server/http/handler";

export const GET = apiRoute({}, async ({ user }) => {
  assertAdmin(user.email);
  return adminOverview();
});
