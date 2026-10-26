"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/settings", "Workspace & privacy"],
  ["/settings/usage", "Usage & plan"],
  ["/settings/security", "Account & security"],
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="mb-5 inline-flex flex-wrap gap-1 rounded-xl bg-black/25 p-1" aria-label="Settings">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", path === href ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
