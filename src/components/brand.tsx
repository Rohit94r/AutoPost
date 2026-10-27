import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fcd59a" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="rgba(255,255,255,0.1)" />
      <path d="M8 21c0-7 5.5-12.5 16-13-.5 10.5-6 16-13 16-1.2 0-2.2-.2-3-.6" fill="none" stroke="url(#vg)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 24c3-4 6.5-7 11-9.5" fill="none" stroke="url(#vg)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 text-white", className)}>
      <LogoMark />
      <span className="font-display text-2xl tracking-tight">FLOWT</span>
    </Link>
  );
}
