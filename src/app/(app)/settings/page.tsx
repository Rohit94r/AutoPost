import { SettingsNav } from "@/components/settings/settings-nav";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";
import { roleAtLeast } from "@/server/workspaces/service";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  const w = ctx.workspace;
  return (
    <>
      <PageHeader eyebrow="Settings" title="Workspace settings" />
      <SettingsNav />
      <WorkspaceForm ws={{ name: w.name, timezone: w.timezone, documentRetentionDays: w.documentRetentionDays, aiConsent: Boolean(w.aiProcessingConsentAt) }} canEdit={roleAtLeast(ctx.role, "admin")} />
    </>
  );
}
