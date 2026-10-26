import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type Glyph = { fill?: string; stroke?: boolean; body: React.ReactNode };

/** Simple monochrome platform marks (inline SVG, no third-party assets). */
const GLYPHS: Record<Platform, Glyph> = {
  linkedin: {
    body: <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />,
  },
  instagram: {
    stroke: true,
    body: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  x: { body: <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" /> },
  facebook: { body: <path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2-2.6 0-4.3 1.6-4.3 4.4v2.1H7.4V12h2.8v10H14V12h2.8l.4-3.5z" /> },
  threads: {
    stroke: true,
    body: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
      </>
    ),
  },
  youtube: {
    body: (
      <>
        <path d="M22 8.2c-.2-1.7-1-2.9-2.9-3.1C16.4 4.8 12 4.8 12 4.8s-4.4 0-7.1.3C3 5.3 2.2 6.5 2 8.2 1.8 9.6 1.8 12 1.8 12s0 2.4.2 3.8c.2 1.7 1 2.9 2.9 3.1 2.7.3 7.1.3 7.1.3s4.4 0 7.1-.3c1.9-.2 2.7-1.4 2.9-3.1.2-1.4.2-3.8.2-3.8s0-2.4-.2-3.8z" />
        <path d="m10 15.3 5.2-3.3L10 8.7z" fill="#000" fillOpacity=".55" />
      </>
    ),
  },
  tiktok: { body: <path d="M16.6 2c.4 2.4 1.9 4 4.4 4.3v3.4c-1.6 0-3.1-.5-4.4-1.3v6.4a6.2 6.2 0 1 1-6.2-6.2l.9.1v3.5a2.8 2.8 0 1 0 2 2.7V2z" /> },
  pinterest: {
    body: (
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.79-.17-2 .03-2.86l1.2-5.08s-.3-.61-.3-1.5c0-1.41.82-2.46 1.83-2.46.86 0 1.28.65 1.28 1.42 0 .87-.55 2.16-.83 3.36-.24 1 .5 1.82 1.49 1.82 1.79 0 3.17-1.89 3.17-4.62 0-2.41-1.73-4.1-4.21-4.1-2.87 0-4.55 2.15-4.55 4.37 0 .87.33 1.8.75 2.3.08.1.1.19.07.29l-.28 1.14c-.04.18-.15.22-.34.13-1.25-.58-2.03-2.4-2.03-3.87 0-3.15 2.29-6.04 6.6-6.04 3.46 0 6.16 2.47 6.16 5.77 0 3.44-2.17 6.21-5.18 6.21-1.01 0-1.96-.53-2.29-1.15l-.62 2.38c-.23.87-.84 1.96-1.25 2.62A10 10 0 1 0 12 2z" />
    ),
  },
  reddit: {
    body: (
      <>
        <circle cx="12" cy="13.5" r="7.5" />
        <circle cx="18.5" cy="4.5" r="1.6" />
        <path d="M12 6V3.5l5 1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="9.2" cy="13" r="1.2" fill="#000" fillOpacity=".55" />
        <circle cx="14.8" cy="13" r="1.2" fill="#000" fillOpacity=".55" />
        <path d="M9 16.2c1.8 1.2 4.2 1.2 6 0" fill="none" stroke="#000" strokeOpacity=".55" strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  bluesky: {
    body: (
      <path d="M6.3 4.2c2.3 1.7 4.7 5.2 5.7 7 1-1.8 3.4-5.3 5.7-7 1.6-1.2 4.3-2.2 4.3.9 0 .6-.4 5.2-.6 5.9-.7 2.5-3.3 3.1-5.6 2.7 4 .7 5 2.9 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5l-.1-.4-.1.4c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.3-1.2-4.5 2.8-5.2-2.3.4-4.9-.2-5.6-2.7C2.4 10.3 2 5.7 2 5.1c0-3.1 2.7-2.1 4.3-.9z" />
    ),
  },
  mastodon: {
    body: (
      <path d="M21.3 13.9c-.3 1.5-2.6 3.1-5.3 3.4-1.4.2-2.8.3-4.2.3-2.3-.1-4.2-.6-4.2-.6v.6c.3 2.3 2.3 2.5 4.2 2.5 1.9.1 3.6-.5 3.6-.5l.1 1.7s-1.3.7-3.7.9c-1.3.1-2.9-.1-4.8-.6-4.1-1.1-4.8-5.5-4.9-10V7.8c0-4.5 2.9-5.8 2.9-5.8C6.5 1.3 9 1 11.6 1h.1c2.6 0 5.1.3 6.6 1 0 0 2.9 1.3 2.9 5.8 0 0 0 3.3-.4 5.6zM18.2 8.3c0-1.1-.3-2-.9-2.6-.6-.7-1.4-1-2.4-1-1.1 0-2 .4-2.5 1.3l-.5.9-.5-.9c-.6-.9-1.4-1.3-2.5-1.3-1 0-1.8.3-2.4 1-.6.7-.9 1.5-.9 2.6v5.4h2.1V8.4c0-1.1.5-1.6 1.4-1.6 1 0 1.5.7 1.5 2v2.9h2.1V8.8c0-1.3.5-2 1.5-2 .9 0 1.4.6 1.4 1.6v5.3h2.1z" />
    ),
  },
  telegram: { body: <path d="M21.4 3.6 2.9 10.7c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.5c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5zM8.3 13.4l9.6-6c.4-.3.9-.1.5.3l-7.9 7.1-.3 3.3z" /> },
  discord: {
    body: (
      <path d="M19.6 5.3A16.4 16.4 0 0 0 15.5 4l-.5 1a15.2 15.2 0 0 0-6 0l-.5-1a16.4 16.4 0 0 0-4.1 1.3C1.8 9.1 1.1 12.9 1.4 16.6a16.6 16.6 0 0 0 5 2.5l1.1-1.7c-.6-.2-1.2-.5-1.7-.9l.4-.3c3.6 1.7 7.9 1.7 11.6 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.7a16.6 16.6 0 0 0 5-2.5c.4-4.3-.6-8-3-11.3zM8.7 14.3c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    ),
  },
  wordpress: {
    stroke: true,
    body: (
      <>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M6.5 8.5 9.4 17l2.6-7 2.6 7 2.9-8.5M5.5 8.5h3M15.5 8.5h3" />
      </>
    ),
  },
  webhook: {
    stroke: true,
    body: (
      <>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5s1.3-6.9 3.9-9.5z" />
      </>
    ),
  },
};

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const g = GLYPHS[platform];
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      fill={g.stroke ? "none" : "currentColor"}
      stroke={g.stroke ? "currentColor" : undefined}
      strokeWidth={g.stroke ? 2 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={PLATFORM_META[platform].label}
      role="img"
    >
      {g.body}
    </svg>
  );
}

export function PlatformBadge({ platform, size = "md", withLabel }: { platform: Platform; size?: "sm" | "md"; withLabel?: boolean }) {
  const color = PLATFORM_META[platform].color;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-lg text-white ring-1", size === "sm" ? "px-1.5 py-1" : "px-2 py-1.5", withLabel && "pr-2.5")}
      style={{ backgroundColor: `${color}2e`, boxShadow: `inset 0 0 0 1px ${color}66` }}
    >
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
  needs_review: { label: "Needs review", cls: "bg-amber-400/15 text-amber-200" },
  new: { label: "New", cls: "bg-sky-400/15 text-sky-200" },
  replied: { label: "Replied", cls: "bg-emerald-400/15 text-emerald-200" },
  ignored: { label: "Ignored", cls: "bg-white/8 text-stone" },
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
