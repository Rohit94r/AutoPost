import Image from "next/image";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4 py-16">
      <Image src="/images/auth-hills.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div className="absolute inset-0 -z-10 bg-linear-to-br from-black/60 via-black/35 to-ink/80" />
      <div className="absolute left-5 top-5">
        <Logo />
      </div>
      <div className="w-full max-w-md animate-rise">{children}</div>
      <p className="absolute bottom-4 text-xs text-white/50">Your social passwords never touch FLOWT.</p>
    </div>
  );
}
