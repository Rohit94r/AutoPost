import { SetupGuide } from "@/components/setup/setup-guide";
import { PageHeader } from "@/components/ui/misc";
import { isAdmin } from "@/server/admin/service";
import { requirePageContext } from "@/server/auth/session";
import { env } from "@/server/env";
import { platformServerStatus, serverChecks, setupProgress } from "@/server/setup/service";
import { roleAtLeast } from "@/server/workspaces/service";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

/** Step-by-step setup after sign-in: brand voice, apps, first post, publishing, autopilot, inbox. */
export default async function SetupPage() {
  const ctx = await requirePageContext();
  const admin = isAdmin(ctx.user.email);
  const [progress, checks] = await Promise.all([setupProgress(ctx.user.id, ctx.workspace.id), admin ? serverChecks() : null]);
  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title={`Let's get you posting, ${ctx.user.name.split(" ")[0]}`}
        description="Follow the steps in order, or skip any of them. You can come back to this page at any time."
      />
      <SetupGuide
        steps={progress.steps}
        connected={progress.connected}
        skipped={progress.skipped}
        hidden={progress.hidden}
        canManage={roleAtLeast(ctx.role, "admin")}
        platforms={platformServerStatus()}
        server={checks ? { checks, baseUrl: env().APP_BASE_URL } : null}
      />
    </>
  );
}
