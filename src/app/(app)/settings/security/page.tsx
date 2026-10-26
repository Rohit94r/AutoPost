import { and, eq } from "drizzle-orm";
import { SecuritySettings } from "@/components/settings/security";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePageContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { authAccounts } from "@/server/db/schema";

export const metadata = { title: "Account & security" };

export default async function SecurityPage() {
  const ctx = await requirePageContext();
  const session = await getSession();
  const [pw] = await db.select({ id: authAccounts.id }).from(authAccounts).where(and(eq(authAccounts.userId, ctx.user.id), eq(authAccounts.providerId, "credential")));
  return (
    <>
      <PageHeader eyebrow="Settings" title="Account & security" description={ctx.user.email} />
      <SettingsNav />
      <SecuritySettings email={ctx.user.email} hasPassword={Boolean(pw)} currentToken={session?.session.token ?? null} />
    </>
  );
}
