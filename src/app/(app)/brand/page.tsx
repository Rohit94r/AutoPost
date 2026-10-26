import { BrandEditor, type Brand } from "@/components/brand/brand-editor";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";
import { listBrands } from "@/server/brand/service";
import { integrationStatus } from "@/server/env";

export const metadata = { title: "Brand voice" };

export default async function BrandPage() {
  const ctx = await requirePageContext();
  const brands = await listBrands(ctx.workspace.id);
  const i = integrationStatus();
  return (
    <>
      <PageHeader eyebrow="Personalization" title="Brand voice" description="Reusable profiles that shape every draft: tone, vocabulary, what to avoid, and a style learned from your own posts." />
      <BrandEditor brands={JSON.parse(JSON.stringify(brands)) as Brand[]} aiAvailable={i.gemini || i.groq} />
    </>
  );
}
