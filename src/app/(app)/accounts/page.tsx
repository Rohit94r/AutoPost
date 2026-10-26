import { desc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { Accounts } from "@/components/accounts/accounts";
import { PageHeader } from "@/components/ui/misc";
import { PLATFORMS } from "@/lib/platforms";
import { requirePageContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { socialAccounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { getAdapter } from "@/server/platforms/registry";
import { roleAtLeast } from "@/server/workspaces/service";

export const metadata = { title: "Connected accounts" };

export default async function AccountsPage() {
  const ctx = await requirePageContext();
  const rows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      displayName: socialAccounts.displayName,
      username: socialAccounts.username,
      avatarUrl: socialAccounts.avatarUrl,
      accountType: socialAccounts.accountType,
      status: socialAccounts.status,
      grantedScopes: socialAccounts.grantedScopes,
      tokenExpiresAt: socialAccounts.tokenExpiresAt,
      lastError: socialAccounts.lastError,
      createdAt: socialAccounts.createdAt,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.workspaceId, ctx.workspace.id))
    .orderBy(desc(socialAccounts.createdAt));
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Connected accounts"
        description={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-moss" /> Official OAuth only. Tokens are encrypted server-side and never sent to your browser.
          </span>
        }
      />
      <Suspense>
        <Accounts
          accounts={rows.map((r) => ({ ...r, tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }))}
          platforms={PLATFORMS.map((p) => ({ platform: p, configured: getAdapter(p).isConfigured(), scopes: getAdapter(p).requestedScopes() }))}
          canManage={roleAtLeast(ctx.role, "admin")}
          baseUrl={env().APP_BASE_URL}
        />
      </Suspense>
    </>
  );
}
