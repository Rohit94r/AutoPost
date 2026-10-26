import { desc, eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { Accounts, type AccountView, type PlatformView } from "@/components/accounts/accounts";
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
  const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.workspaceId, ctx.workspace.id)).orderBy(desc(socialAccounts.createdAt));
  // Only safe fields go to the browser: tokens live in a separate encrypted table and are never selected here.
  const accounts: AccountView[] = rows.map((r) => {
    const m = r.metadata as { settings?: Record<string, string>; boards?: { id: string; name: string }[] };
    return {
      id: r.id,
      platform: r.platform,
      displayName: r.displayName,
      username: r.username,
      avatarUrl: r.avatarUrl,
      accountType: r.accountType,
      status: r.status,
      grantedScopes: r.grantedScopes,
      tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
      lastError: r.lastError,
      createdAt: r.createdAt.toISOString(),
      settings: m.settings ?? {},
      boards: (m.boards ?? []).map((b) => ({ id: b.id, name: b.name })),
    };
  });
  const platforms: PlatformView[] = PLATFORMS.map((p) => {
    const a = getAdapter(p);
    return { platform: p, configured: a.isConfigured(), credentialFields: a.credentialFields?.() ?? null };
  });
  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Connected accounts"
        description={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-moss" /> Official APIs only. Tokens are encrypted on the server and never sent to your browser.
          </span>
        }
      />
      <Suspense>
        <Accounts accounts={accounts} platforms={platforms} canManage={roleAtLeast(ctx.role, "admin")} baseUrl={env().APP_BASE_URL} />
      </Suspense>
    </>
  );
}
