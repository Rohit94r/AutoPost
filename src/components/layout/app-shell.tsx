"use client";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link2,
  ListOrdered,
  LogOut,
  Menu,
  Palette,
  PenSquare,
  Plus,
  Rocket,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as DM, Popover } from "radix-ui";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand";
import { PlatformIcon } from "@/components/ui/platform";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { cn, timeAgo } from "@/lib/utils";

// "Apps" (one page per connected platform) is rendered after the Create items.
const NAV = [
  { section: "Create", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/compose", label: "Create post", icon: PenSquare },
  ] },
  { section: "Engage", items: [
    { href: "/inbox", label: "Inbox", icon: Inbox },
  ] },
  { section: "Publish", items: [
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/queue", label: "Queue", icon: ListOrdered },
    { href: "/history", label: "History", icon: History },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { section: "Workspace", items: [
    { href: "/accounts", label: "Accounts", icon: Link2 },
    { href: "/brand", label: "Brand voice", icon: Palette },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/help", label: "Help", icon: LifeBuoy },
  ] },
];

interface Props {
  user: { name: string; email: string; image: string | null };
  workspace: { id: string; name: string; plan: string; role: string };
  memberships: { id: string; name: string; role: string }[];
  isAdmin: boolean;
  /** Connected platforms with the number of comments waiting. */
  channels: { platform: Platform; open: number }[];
  /** Get started steps left (0 when finished or hidden: the sidebar item disappears). */
  setupRemaining: number;
  children: React.ReactNode;
}

export function AppShell({ user, workspace, memberships, isAdmin, channels, setupRemaining, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(pathname.startsWith("/channels/"));
  const totalOpen = channels.reduce((s, ch) => s + ch.open, 0);

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4" aria-label="App">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-stone">{group.section}</p>
          <ul className="space-y-0.5">
            {group.section === "Create" && setupRemaining > 0 && (
              <li>
                <Link
                  href="/setup"
                  onClick={() => setOpen(false)}
                  aria-current={pathname === "/setup" ? "page" : undefined}
                  className={cn("group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", pathname === "/setup" ? "bg-white/12 text-white" : "text-fog hover:bg-white/6 hover:text-white")}
                >
                  <Rocket className={cn("size-4", pathname === "/setup" ? "text-moss" : "text-sun")} />
                  <span className="flex-1">Get started</span>
                  <span className="rounded-full bg-sun/20 px-1.5 text-[10px] font-semibold text-sun">{setupRemaining} left</span>
                </Link>
              </li>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                      active ? "bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-fog hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <item.icon className={cn("size-4 transition", active ? "text-moss" : "text-stone group-hover:text-mist")} />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/inbox" && totalOpen > 0 && <span className="rounded-full bg-dawn/90 px-1.5 text-[10px] font-semibold text-ink">{totalOpen}</span>}
                  </Link>
                </li>
              );
            })}
            {group.section === "Create" && (
              <li>
                <button
                  type="button"
                  onClick={() => setAppsOpen((o) => !o)}
                  aria-expanded={appsOpen}
                  aria-controls="nav-apps"
                  className={cn("group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition", pathname.startsWith("/channels/") ? "text-white" : "text-fog hover:bg-white/6 hover:text-white")}
                >
                  <LayoutGrid className={cn("size-4 transition", pathname.startsWith("/channels/") ? "text-moss" : "text-stone group-hover:text-mist")} />
                  <span className="flex-1 text-left">Apps</span>
                  {!appsOpen && channels.length > 0 && <span className="text-[11px] text-stone">{channels.length}</span>}
                  <ChevronDown className={cn("size-4 text-stone transition", appsOpen && "rotate-180")} />
                </button>
                {appsOpen && (
                  <ul id="nav-apps" className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                    {channels.map((ch) => {
                      const href = `/channels/${ch.platform}`;
                      const active = pathname === href;
                      return (
                        <li key={ch.platform}>
                          <Link
                            href={href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn("group flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition", active ? "bg-white/12 text-white" : "text-fog hover:bg-white/6 hover:text-white")}
                          >
                            <PlatformIcon platform={ch.platform} className={cn("size-4", active ? "text-moss" : "text-stone group-hover:text-mist")} />
                            <span className="flex-1 truncate">{PLATFORM_META[ch.platform].label}</span>
                            {ch.open > 0 && <span className="rounded-full bg-dawn/90 px-1.5 text-[10px] font-semibold text-ink">{ch.open}</span>}
                          </Link>
                        </li>
                      );
                    })}
                    <li>
                      <Link href="/accounts" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm text-stone transition hover:bg-white/6 hover:text-white">
                        <Plus className="size-4" /> {channels.length ? "Connect more" : "Connect an app"}
                      </Link>
                    </li>
                  </ul>
                )}
              </li>
            )}
          </ul>
        </div>
      ))}
      {isAdmin && (
        <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-fog hover:bg-white/6 hover:text-white">
          <ShieldAlert className="size-4 text-sun" /> Admin
        </Link>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="glass-strong sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col rounded-3xl! lg:flex">
        <div className="px-5 pb-4 pt-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-white">
            <LogoMark />
            <span className="font-display text-2xl">FLOWT</span>
          </Link>
        </div>
        <div className="px-3 pb-4">
          <WorkspaceSwitcher workspace={workspace} memberships={memberships} />
        </div>
        {nav}
        <div className="border-t border-white/8 p-3">
          <Button asChild className="w-full">
            <Link href="/compose">
              <PenSquare /> New post
            </Link>
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="glass-strong absolute inset-y-2 left-2 flex w-72 flex-col rounded-3xl!">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="flex items-center gap-2 text-white">
                <LogoMark /> <span className="font-display text-2xl">FLOWT</span>
              </span>
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-1 text-fog">
                <X className="size-5" />
              </button>
            </div>
            <div className="px-3 pb-3">
              <WorkspaceSwitcher workspace={workspace} memberships={memberships} />
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 px-4 lg:px-6">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/85 to-transparent backdrop-blur-[2px]" />
          <button className="glass grid size-10 place-items-center rounded-xl! lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Notifications />
          <UserMenu user={user} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-2 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function WorkspaceSwitcher({ workspace, memberships }: Pick<Props, "workspace" | "memberships">) {
  const router = useRouter();
  return (
    <DM.Root>
      <DM.Trigger className="flex w-full items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5 text-left transition hover:bg-black/35">
        <span className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-sun/80 to-moss-strong/80 text-sm font-bold text-ink">{workspace.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{workspace.name}</span>
          <span className="block text-[11px] capitalize text-stone">
            {workspace.plan} plan · {workspace.role}
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-stone" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="start" sideOffset={6} className="glass-strong z-50 min-w-56 rounded-xl! p-1.5">
          <DM.Label className="px-2 py-1 text-[11px] uppercase tracking-wider text-stone">Workspaces</DM.Label>
          {memberships.map((m) => (
            <DM.Item
              key={m.id}
              onSelect={async () => {
                if (m.id === workspace.id) return;
                await api("/workspace/switch", { method: "POST", json: { workspaceId: m.id } });
                router.refresh();
              }}
              className={cn("cursor-pointer rounded-lg px-2 py-2 text-sm outline-none data-highlighted:bg-white/10", m.id === workspace.id ? "text-white" : "text-fog")}
            >
              {m.name} <span className="ml-1 text-xs text-stone">({m.role})</span>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: string;
  readAt: string | null;
  createdAt: string;
}

function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ notifications: Notification[]; unread: number }>("/notifications")
        .then((r) => {
          if (!alive) return;
          setItems(r.notifications);
          setUnread(r.unread);
        })
        .catch(() => undefined); // non-critical
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const dot = { success: "bg-moss", warning: "bg-sun", error: "bg-dawn", info: "bg-sky-300" } as Record<string, string>;
  return (
    <Popover.Root
      onOpenChange={async (o) => {
        if (!o && unread) {
          await api("/notifications", { method: "POST" }).catch(() => undefined);
          setUnread(0);
        }
      }}
    >
      <Popover.Trigger className="glass relative grid size-10 place-items-center rounded-xl! text-fog hover:text-white" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <Bell className="size-4.5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-dawn px-1 text-[10px] font-bold text-ink">{unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="glass-strong z-50 w-[min(92vw,380px)] rounded-2xl! p-2">
          <p className="px-2 py-1.5 text-sm font-semibold text-white">Notifications</p>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-stone">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <Link key={n.id} href={n.link ?? "#"} className="flex gap-3 rounded-xl px-2 py-2.5 hover:bg-white/6">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot[n.severity] ?? "bg-fog", n.readAt && "opacity-30")} />
                  <span className="min-w-0">
                    <span className="block text-sm text-white">{n.title}</span>
                    {n.body && <span className="block text-xs text-fog">{n.body}</span>}
                    <span className="block text-[11px] text-stone">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu({ user }: Pick<Props, "user">) {
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DM.Root>
      <DM.Trigger className="glass flex h-10 items-center gap-2 rounded-xl! pl-1.5 pr-3 text-sm text-mist" aria-label="Account menu">
        <span className="grid size-7 place-items-center rounded-lg bg-white/15 text-xs font-semibold">{initials || "U"}</span>
        <span className="hidden max-w-36 truncate sm:block">{user.name}</span>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="glass-strong z-50 min-w-56 rounded-xl! p-1.5">
          <div className="px-2 py-1.5">
            <p className="text-sm text-white">{user.name}</p>
            <p className="text-xs text-stone">{user.email}</p>
          </div>
          <DM.Separator className="my-1 h-px bg-white/10" />
          {[
            ["/settings/security", "Account & security"],
            ["/settings/usage", "Usage & plan"],
            ["/setup", "Get started guide"],
          ].map(([href, label]) => (
            <DM.Item key={href} asChild className="cursor-pointer rounded-lg px-2 py-2 text-sm text-fog outline-none data-highlighted:bg-white/10 data-highlighted:text-white">
              <Link href={href!}>{label}</Link>
            </DM.Item>
          ))}
          <DM.Item
            onSelect={async () => {
              await authClient.signOut();
              router.replace("/sign-in");
              router.refresh();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-dawn outline-none data-highlighted:bg-white/10"
          >
            <LogOut className="size-4" /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
