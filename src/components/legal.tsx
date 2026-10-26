import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand";

export const LEGAL_UPDATED = "26 October 2026";

/** Shared shell for Terms / Privacy / Data deletion (public pages, also used in platform app reviews). */
export function LegalPage({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh px-4 pb-20 pt-24">
      <Image src="/images/golden-valley.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-30" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/80 via-ink/92 to-ink" />
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4">
        <Logo />
        <nav className="flex gap-4 text-sm text-fog">
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/data-deletion" className="hover:text-white">
            Data deletion
          </Link>
        </nav>
      </header>
      <article className="glass-strong mx-auto max-w-3xl p-7 sm:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-moss">Last updated {LEGAL_UPDATED}</p>
        <h1 className="mt-2 font-display text-5xl text-white">{title}</h1>
        {intro && <p className="mt-4 text-[15px] leading-relaxed text-mist/90">{intro}</p>}
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-fog [&_a]:text-moss [&_a]:underline [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
          {children}
        </div>
      </article>
    </div>
  );
}

export function contactLine(email: string | undefined, entity: string) {
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <>the support contact published by {entity}</>
  );
}
