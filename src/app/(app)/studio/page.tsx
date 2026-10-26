import { Studio } from "@/components/studio/studio";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";
import { listBrands } from "@/server/brand/service";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "AI studio" };

export default async function StudioPage() {
  const ctx = await requirePageContext();
  const brands = await listBrands(ctx.workspace.id);
  const i = integrationStatus();
  return (
    <>
      <PageHeader
        eyebrow="AI writing studio"
        title="Write like you, only faster"
        description="Specific, natural writing that stays true to your facts. We optimise for clarity and authenticity, not for fooling AI detectors."
      />
      <Studio brands={brands.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))} aiAvailable={i.groq || i.gemini} />
    </>
  );
}
