import * as React from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function GlassCard({ className, strong, ...props }: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return <div className={cn(strong ? "glass-strong" : "glass", "p-5", className)} {...props} />;
}

export function CardTitle({ children, action, description, icon }: { children: React.ReactNode; action?: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/8 text-moss [&_svg]:size-4.5">{icon}</div>}
        <div>
          <h2 className="text-[15px] font-semibold text-white">{children}</h2>
          {description && <p className="mt-0.5 text-sm text-fog">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-rise">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-moss/90">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-tight text-white md:text-[2.8rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-fog">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/8 text-moss [&_svg]:size-6">{icon}</div>}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-fog">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneCls = { default: "text-moss", good: "text-moss", warn: "text-sun", bad: "text-dawn" }[tone];
  return (
    <div className="glass p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.09]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-fog">{label}</p>
        {icon && <span className={cn("[&_svg]:size-4", toneCls)}>{icon}</span>}
      </div>
      <p className="mt-2 font-display text-4xl text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const cls = {
    info: "border-sky-300/25 bg-sky-400/10 text-sky-100",
    warn: "border-amber-300/30 bg-amber-400/10 text-amber-100",
    error: "border-red-300/30 bg-red-500/10 text-red-100",
    success: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", cls, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
