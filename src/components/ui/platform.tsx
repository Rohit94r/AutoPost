import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** Simple monochrome platform marks (inline SVG, no third-party assets). */
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const cls = cn("size-4", className);
  if (platform === "linkedin")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-label="LinkedIn" role="img">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
      </svg>
    );
  if (platform === "instagram")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram" role="img">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-label="X" role="img">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" />
    </svg>
  );
}

const BG: Record<Platform, string> = {
  linkedin: "bg-[#0A66C2]/25 text-[#8cc4ff] ring-[#0A66C2]/40",
  instagram: "bg-linear-to-br from-[#f58529]/25 via-[#dd2a7b]/25 to-[#8134af]/25 text-[#ffb3d1] ring-[#dd2a7b]/40",
  x: "bg-white/10 text-white ring-white/25",
};

export function PlatformBadge({ platform, size = "md", withLabel }: { platform: Platform; size?: "sm" | "md"; withLabel?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg ring-1", BG[platform], size === "sm" ? "px-1.5 py-1" : "px-2 py-1.5", withLabel && "pr-2.5")}>
      <PlatformIcon platform={platform} className={size === "sm" ? "size-3" : "size-3.5"} />
      {withLabel && <span className="text-xs font-medium">{PLATFORM_META[platform].label}</span>}
    </span>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-white/10 text-fog" },
  queued: { label: "Queued", cls: "bg-sky-400/15 text-sky-200" },
  scheduled: { label: "Scheduled", cls: "bg-sky-400/15 text-sky-200" },
  processing: { label: "Publishing…", cls: "bg-amber-400/15 text-amber-200" },
  publishing: { label: "Publishing…", cls: "bg-amber-400/15 text-amber-200" },
  published: { label: "Published", cls: "bg-emerald-400/15 text-emerald-200" },
  partially_published: { label: "Partially published", cls: "bg-amber-400/15 text-amber-200" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-200" },
  cancelled: { label: "Cancelled", cls: "bg-white/8 text-stone" },
  archived: { label: "Archived", cls: "bg-white/8 text-stone" },
  needs_reconnection: { label: "Needs reconnection", cls: "bg-orange-400/15 text-orange-200" },
  connected: { label: "Connected", cls: "bg-emerald-400/15 text-emerald-200" },
  expired: { label: "Expired", cls: "bg-orange-400/15 text-orange-200" },
  permission_required: { label: "Permission required", cls: "bg-amber-400/15 text-amber-200" },
  disconnected: { label: "Disconnected", cls: "bg-white/8 text-stone" },
  error: { label: "Error", cls: "bg-red-500/15 text-red-200" },
  uploaded: { label: "Uploaded", cls: "bg-white/10 text-fog" },
  extracted: { label: "Ready to review", cls: "bg-sky-400/15 text-sky-200" },
  reviewed: { label: "Reviewed", cls: "bg-emerald-400/15 text-emerald-200" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-white/10 text-fog" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {s.label}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-xs text-mist", className)}>{children}</span>;
}
