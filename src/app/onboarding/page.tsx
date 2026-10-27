import Image from "next/image";
import { Logo } from "@/components/brand";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { requirePageContext } from "@/server/auth/session";
import { getDefaultBrand } from "@/server/brand/service";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await requirePageContext();
  const brand = await getDefaultBrand(ctx.workspace.id);
  return (
    <div className="relative isolate min-h-dvh px-4 py-20">
      <Image src="/images/golden-valley.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-black/55 via-black/45 to-ink/90" />
      <div className="absolute left-5 top-5">
        <Logo href="/onboarding" />
      </div>
      <OnboardingWizard
        userName={ctx.user.name}
        workspace={{ name: ctx.workspace.name }}
        brand={brand ? { id: brand.id, name: brand.name } : null}
      />
    </div>
  );
}
