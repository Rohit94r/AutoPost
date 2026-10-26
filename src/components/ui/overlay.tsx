"use client";
import { X } from "lucide-react";
import { Dialog as D, Switch as S, Tabs as T, Tooltip as TT } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; wide?: boolean | "xl" }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[rise_.2s_ease]" />
        <D.Content className={cn("glass-strong fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 focus:outline-none", wide === "xl" ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg")}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-lg font-semibold text-white">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-fog">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="rounded-lg p-1 text-fog hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Switch({ checked, onCheckedChange, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; label?: string }) {
  return (
    <S.Root id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-white/15 transition data-[state=checked]:bg-moss-strong/80">
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </S.Root>
  );
}

export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex flex-wrap gap-1 rounded-xl bg-black/25 p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("rounded-lg px-3 py-1.5 text-sm text-fog transition hover:text-white data-[state=active]:bg-white/12 data-[state=active]:text-white", className)} {...p} />;
}
export const TabsContent = T.Content;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TT.Provider delayDuration={200}>
      <TT.Root>
        <TT.Trigger asChild>{children}</TT.Trigger>
        <TT.Portal>
          <TT.Content sideOffset={6} className="z-50 max-w-xs rounded-lg border border-white/10 bg-[#0c1a14]/95 px-2.5 py-1.5 text-xs text-mist shadow-xl backdrop-blur">
            {content}
          </TT.Content>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}
