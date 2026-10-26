import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";
import { apiRoute, uuidParam } from "@/server/http/handler";
import { refreshAccount } from "@/server/oauth/service";
import { PlatformError } from "@/server/platforms/types";

/** Manually refresh an account's tokens (where the platform supports it). */
export const POST = apiRoute<{ key: string }>({ role: "admin" }, async ({ params, workspace }) => {
  const [account] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, uuidParam(params.key)), eq(socialAccounts.workspaceId, workspace.id)));
  if (!account) throw notFound("Account");
  try {
    const refreshed = await refreshAccount(account);
    return { refreshed, message: refreshed ? "Connection refreshed." : "This platform doesn't support refreshing this connection. Reconnect instead." };
  } catch (err) {
    if (err instanceof PlatformError) throw new AppError(err.kind === "auth" ? 409 : 502, `platform_${err.kind}`, err.message);
    throw err;
  }
});
