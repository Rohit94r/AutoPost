"use client";
import { AlertTriangle, ExternalLink, Plug, RefreshCcw, Unplug } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard, Notice } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import { timeAgo } from "@/lib/utils";

interface Account {
  id: string;
  platform: Platform;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: string;
  status: string;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
}

const NOTES: Record<Platform, string> = {
  linkedin: "Posts as you (member). Tokens last 60 days and can't be auto-refreshed for most apps, so you'll be reminded to reconnect.",
  instagram: "Requires an Instagram Business or Creator account. Media must be reachable from a public HTTPS URL.",
  x: "Uses OAuth 2.0 with PKCE. X API access is pay-per-use; posts with links cost more.",
};

export function Accounts({ accounts, platforms, canManage, baseUrl }: { accounts: Account[]; platforms: { platform: Platform; configured: boolean; scopes: string[] }[]; canManage: boolean; baseUrl: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Account | null>(null);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    const warning = params.get("warning");
    if (connected) toast.success(`Connected ${connected} ${PLATFORM_META[(params.get("platform") as Platform) ?? "x"]?.label ?? ""} account${connected === "1" ? "" : "s"}`);
    if (error) toast.error(error);
    if (warning) toast.warning(warning, { duration: 12_000 });
    if (connected || error || warning) router.replace("/accounts");
  }, [params, router]);

  async function connect(p: Platform) {
    setBusy(`c-${p}`);
    try {
      const { url } = await api<{ url: string }>(`/social-accounts/${p}/connect`, { method: "POST" });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function refresh(a: Account) {
    setBusy(`r-${a.id}`);
    try {
      const r = await api<{ message: string }>(`/social-accounts/${a.id}/refresh`, { method: "POST" });
      toast.message(r.message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(a: Account) {
    setBusy(`d-${a.id}`);
    try {
      const r = await api<{ note?: string }>(`/social-accounts/${a.id}`, { method: "DELETE" });
      toast.success(`${a.displayName} disconnected`);
      if (r.note) toast.message(r.note, { duration: 10_000 });
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {PLATFORMS.map((p) => {
        const meta = platforms.find((x) => x.platform === p)!;
        const list = accounts.filter((a) => a.platform === p && a.status !== "disconnected");
        return (
          <GlassCard key={p} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-white">
                <PlatformIcon platform={p} className="size-5" />
              </span>
              <div className="flex-1">
                <h2 className="font-semibold text-white">{PLATFORM_META[p].label}</h2>
                <p className="text-xs text-stone">{meta.configured ? "Official OAuth" : "Not configured on this server"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-fog">{NOTES[p]}</p>

            <ul className="mt-4 flex-1 space-y-2">
              {list.map((a) => {
                const days = a.tokenExpiresAt ? Math.ceil((new Date(a.tokenExpiresAt).getTime() - Date.now()) / 86400_000) : null;
                return (
                  <li key={a.id} className="rounded-xl bg-black/25 p-3">
                    <div className="flex items-center gap-2.5">
                      {a.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xs">{a.displayName[0]}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{a.displayName}</p>
                        <p className="truncate text-xs text-stone">
                          {a.username ? `@${a.username.replace(/^@/, "")} · ` : ""}
                          {a.accountType}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    {a.lastError && a.status !== "connected" && (
                      <p className="mt-2 flex gap-1.5 text-xs text-amber-100/90">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {a.lastError}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-stone">
                      Connected {timeAgo(a.createdAt)}
                      {days !== null && ` · token ${days > 0 ? `expires in ${days} day${days === 1 ? "" : "s"}` : "expired"}`}
                    </p>
                    {a.grantedScopes.length > 0 && <p className="mt-1 truncate text-[11px] text-stone" title={a.grantedScopes.join(", ")}>Scopes: {a.grantedScopes.join(", ")}</p>}
                    {canManage && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(a.status === "expired" || a.status === "permission_required" || (days !== null && days < 10)) && (
                          <Button size="sm" variant="glass" onClick={() => connect(p)} loading={busy === `c-${p}`}>
                            <Plug /> Reconnect
                          </Button>
                        )}
                        {p !== "linkedin" && (
                          <Button size="sm" variant="ghost" onClick={() => refresh(a)} loading={busy === `r-${a.id}`}>
                            <RefreshCcw /> Refresh
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(a)}>
                          <Unplug /> Disconnect
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {meta.configured ? (
              canManage && (
                <Button className="mt-4 w-full" variant={list.length ? "glass" : "primary"} onClick={() => connect(p)} loading={busy === `c-${p}`}>
                  <Plug /> {list.length ? "Connect another" : `Connect ${PLATFORM_META[p].label}`}
                </Button>
              )
            ) : (
              <Notice tone="info" className="mt-4">
                Set the {p.toUpperCase()} app credentials on the server and register this callback:
                <code className="mt-1 block break-all text-[11px] text-white">{`${baseUrl}/api/v1/social-accounts/${p}/callback`}</code>
                <a href={PLATFORM_META[p].docs} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline">
                  Platform docs <ExternalLink className="size-3" />
                </a>
              </Notice>
            )}
            {!canManage && <p className="mt-4 text-xs text-stone">Only workspace admins can connect or disconnect accounts.</p>}
          </GlassCard>
        );
      })}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Disconnect ${confirm?.displayName ?? ""}?`}
        description="Stored tokens are deleted immediately (and revoked where the platform supports it). Scheduled posts for this account will wait for a reconnection."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirm && disconnect(confirm)} loading={busy === `d-${confirm?.id}`}>
              Disconnect
            </Button>
          </>
        }
      />
    </div>
  );
}
