import { eq } from "drizzle-orm";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { isAdmin } from "@/server/admin/service";
import { requirePageContext } from "@/server/auth/session";
import { connectedPlatforms } from "@/server/channels/service";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { setupProgress } from "@/server/setup/service";
import { listMemberships } from "@/server/workspaces/service";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageContext();
  const [u] = await db.select({ onboardingCompletedAt: users.onboardingCompletedAt, timezone: users.timezone }).from(users).where(eq(users.id, ctx.user.id));
  if (!u?.onboardingCompletedAt) redirect("/onboarding");
  const [memberships, channels, setup] = await Promise.all([listMemberships(ctx.user.id), connectedPlatforms(ctx.workspace.id), setupProgress(ctx.user.id, ctx.workspace.id)]);
  return (
    <div className="relative min-h-dvh">
      <div className="fixed inset-0 -z-10">
        <Image src="/images/app-forest.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-[0.38] blur-[2px] saturate-[0.9]" />
        <div className="absolute inset-0 bg-linear-to-br from-ink/80 via-ink/70 to-ink/95" />
      </div>
      <AppShell
        user={{ name: ctx.user.name, email: ctx.user.email, image: ctx.user.image ?? null }}
        workspace={{ id: ctx.workspace.id, name: ctx.workspace.name, plan: ctx.workspace.plan, role: ctx.role }}
        memberships={memberships.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
        isAdmin={isAdmin(ctx.user.email)}
        channels={channels.map((ch) => ({ platform: ch.platform, open: ch.open }))}
        setupRemaining={setup.hidden ? 0 : setup.remaining}
      >
        {children}
      </AppShell>
    </div>
  );
}
