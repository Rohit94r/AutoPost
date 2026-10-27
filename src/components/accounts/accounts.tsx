"use client";
import { AlertTriangle, Check, ExternalLink, KeyRound, Minus, Plug, RefreshCcw, Settings2, Unplug } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { GlassCard, Notice } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { PLATFORM_META, PLATFORMS, type Platform, type PlatformGroup } from "@/lib/platforms";
import { cn, timeAgo } from "@/lib/utils";

export interface AccountView {
  id: string;
  platform: Platform;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: string;
  status: string;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  /** Days until the token expires, computed on the server. */
  daysLeft: number | null;
  lastError: string | null;
  createdAt: string;
  settings: Record<string, string>;
  boards: { id: string; name: string }[];
}

export interface PlatformView {
  platform: Platform;
  configured: boolean;
  credentialFields: { key: string; label: string; type: "text" | "password" | "url"; placeholder?: string; help?: string; required?: boolean }[] | null;
}

const GROUPS: { id: PlatformGroup; label: string }[] = [
  { id: "social", label: "Social networks" },
  { id: "video", label: "Video" },
  { id: "community", label: "Communities" },
  { id: "messaging", label: "Channels & chat" },
  { id: "web", label: "Your website" },
];

/** `isAdmin`: the operator also sees platforms that aren't set up yet, with setup hints. Customers only see what they can use. */
export function Accounts({ accounts, platforms: allPlatforms, canManage, baseUrl, isAdmin }: { accounts: AccountView[]; platforms: PlatformView[]; canManage: boolean; baseUrl: string; isAdmin: boolean }) {
  const platforms = isAdmin ? allPlatforms : allPlatforms.filter((p) => PLATFORM_META[p.platform].connection === "credentials" || p.configured || accounts.some((a) => a.platform === p.platform && a.status !== "disconnected"));
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AccountView | null>(null);
  const [credFor, setCredFor] = useState<PlatformView | null>(null);
  const [settingsFor, setSettingsFor] = useState<AccountView | null>(null);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    const warning = params.get("warning");
    const p = params.get("platform") as Platform | null;
    if (connected) toast.success(`Connected ${connected} ${p && PLATFORM_META[p] ? PLATFORM_META[p].label : ""} account${connected === "1" ? "" : "s"}`);
    if (error) toast.error(error);
    if (warning) toast.warning(warning, { duration: 12_000 });
    if (connected || error || warning) router.replace("/accounts");
  }, [params, router]);

  async function connect(p: PlatformView) {
    if (PLATFORM_META[p.platform].connection === "credentials") return setCredFor(p);
    setBusy(`c-${p.platform}`);
    try {
      const { url } = await api<{ url: string }>(`/social-accounts/${p.platform}/connect`, { method: "POST" });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  // /accounts?connect=<platform> (from the Get started guide) starts that platform's connection.
  const autoConnect = params.get("connect");
  const startAutoConnect = useEffectEvent((platform: string) => {
    router.replace("/accounts");
    const p = platforms.find((x) => x.platform === platform);
    if (!p || !canManage) return;
    if (PLATFORM_META[p.platform].connection !== "credentials" && !p.configured) return toast.error(`${PLATFORM_META[p.platform].label} isn't available yet.`);
    void connect(p);
  });
  useEffect(() => {
    if (autoConnect) void Promise.resolve(autoConnect).then(startAutoConnect);
  }, [autoConnect]);

  async function refresh(a: AccountView) {
    setBusy(`r-${a.id}`);
    try {
      toast.message((await api<{ message: string }>(`/social-accounts/${a.id}/refresh`, { method: "POST" })).message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(a: AccountView) {
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

  const connectedCount = accounts.filter((a) => a.status !== "disconnected").length;

  return (
    <div className="space-y-8">
      <p className="text-sm text-fog">
        {connectedCount} account{connectedCount === 1 ? "" : "s"} connected. Each platform uses its own official sign-in or token, so Verdant never sees your passwords.
      </p>
      {GROUPS.map((g) => {
        const list = platforms.filter((p) => PLATFORM_META[p.platform].group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-stone">{g.label}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <PlatformCard
                  key={p.platform}
                  p={p}
                  accounts={accounts.filter((a) => a.platform === p.platform && a.status !== "disconnected")}
                  canManage={canManage}
                  isAdmin={isAdmin}
                  baseUrl={baseUrl}
                  busy={busy}
                  onConnect={() => connect(p)}
                  onRefresh={refresh}
                  onDisconnect={setConfirm}
                  onSettings={setSettingsFor}
                />
              ))}
            </div>
          </section>
        );
      })}

      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Disconnect ${confirm?.displayName ?? ""}?`}
        description="Stored tokens are deleted immediately (and revoked where the platform supports it). Scheduled posts for this account wait for a reconnection."
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
      {credFor && <CredentialsDialog p={credFor} onClose={() => setCredFor(null)} onDone={() => router.refresh()} />}
      {settingsFor && <SettingsDialog account={settingsFor} onClose={() => setSettingsFor(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

function Capability({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", ok ? "text-moss" : "text-stone")}>
      {ok ? <Check className="size-3" /> : <Minus className="size-3" />} {children}
    </span>
  );
}

function PlatformCard({
  p,
  accounts,
  canManage,
  isAdmin,
  baseUrl,
  busy,
  onConnect,
  onRefresh,
  onDisconnect,
  onSettings,
}: {
  p: PlatformView;
  accounts: AccountView[];
  canManage: boolean;
  isAdmin: boolean;
  baseUrl: string;
  busy: string | null;
  onConnect: () => void;
  onRefresh: (a: AccountView) => void;
  onDisconnect: (a: AccountView) => void;
  onSettings: (a: AccountView) => void;
}) {
  const meta = PLATFORM_META[p.platform];
  const isCred = meta.connection === "credentials";
  const hasSettings = p.platform === "reddit" || p.platform === "pinterest" || p.platform === "youtube" || p.platform === "tiktok";
  return (
    <GlassCard className="flex flex-col">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ backgroundColor: `${meta.color}33`, boxShadow: `inset 0 0 0 1px ${meta.color}66` }}>
          <PlatformIcon platform={p.platform} className="size-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{meta.label}</h3>
          <p className="text-xs text-stone">{isCred ? "Connect with a token or link" : p.configured ? "Official sign-in" : "Not set up yet (only admins see this)"}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-fog">{meta.note}</p>
      {isAdmin && meta.adminNote && <p className="mt-1 text-xs text-sun">{meta.adminNote} (only admins see this)</p>}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        <Capability ok={meta.can.publish}>Publish</Capability>
        <Capability ok={meta.can.comments !== "none"}>Comments</Capability>
        <Capability ok={meta.can.comments === "read_reply"}>Reply</Capability>
        <Capability ok={meta.can.mentions}>Mentions</Capability>
        <Capability ok={meta.can.metrics}>Analytics</Capability>
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {accounts.map((a) => {
          const days = a.daysLeft;
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
                    {a.username ? `${a.username.startsWith("http") ? a.username : `@${a.username.replace(/^@/, "")}`} · ` : ""}
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
                {days !== null && days < 400 && ` · token ${days > 0 ? `renews or expires in ${days} day${days === 1 ? "" : "s"}` : "expired"}`}
              </p>
              {canManage && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(a.status === "expired" || a.status === "permission_required" || (days !== null && days < 10 && p.platform === "linkedin")) && (
                    <Button size="sm" variant="glass" onClick={onConnect} loading={busy === `c-${p.platform}`}>
                      <Plug /> Reconnect
                    </Button>
                  )}
                  {hasSettings && (
                    <Button size="sm" variant="ghost" onClick={() => onSettings(a)}>
                      <Settings2 /> Settings
                    </Button>
                  )}
                  {!isCred && p.platform !== "linkedin" && (
                    <Button size="sm" variant="ghost" onClick={() => onRefresh(a)} loading={busy === `r-${a.id}`}>
                      <RefreshCcw /> Refresh
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onDisconnect(a)}>
                    <Unplug /> Disconnect
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isCred || p.configured ? (
        canManage && (
          <Button className="mt-4 w-full" variant={accounts.length ? "glass" : "primary"} onClick={onConnect} loading={busy === `c-${p.platform}`}>
            {isCred ? <KeyRound /> : <Plug />} {accounts.length ? "Connect another" : `Connect ${meta.label}`}
          </Button>
        )
      ) : (
        <Notice tone="info" className="mt-4">
          Only admins see this. Add this platform&apos;s app keys (Get started → Server setup) and register this redirect URL:
          <code className="mt-1 block break-all text-[11px] text-white">{`${baseUrl}/api/v1/social-accounts/${p.platform}/callback`}</code>
          <a href={meta.docs} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline">
            Platform docs <ExternalLink className="size-3" />
          </a>
        </Notice>
      )}
      {!canManage && <p className="mt-4 text-xs text-stone">Only workspace admins can connect or disconnect accounts.</p>}
    </GlassCard>
  );
}

function CredentialsDialog({ p, onClose, onDone }: { p: PlatformView; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const meta = PLATFORM_META[p.platform];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ accounts: { displayName: string; status: string; reason?: string }[] }>(`/social-accounts/${p.platform}/credentials`, { method: "POST", json: { values } });
      for (const a of r.accounts) {
        if (a.status === "connected") toast.success(`${a.displayName} connected`);
        else toast.warning(`${a.displayName}: ${a.reason ?? a.status}`);
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Connect ${meta.label}`} description={meta.note}>
      <form onSubmit={submit} className="space-y-4">
        {(p.credentialFields ?? []).map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`cred-${f.key}`} hint={f.help}>
            <Input
              id={`cred-${f.key}`}
              type={f.type === "password" ? "password" : f.type === "url" ? "url" : "text"}
              placeholder={f.placeholder}
              required={f.required}
              autoComplete="off"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
        <p className="text-xs text-stone">We check these with {meta.label} and store them encrypted. They&apos;re never shown again or sent to your browser.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsDialog({ account, onClose, onDone }: { account: AccountView; onClose: () => void; onDone: () => void }) {
  const [s, setS] = useState<Record<string, string>>(account.settings);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== ""));
      await api(`/social-accounts/${account.id}/settings`, { method: "PATCH", json: body });
      toast.success("Settings saved");
      onDone();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${account.displayName} settings`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {account.platform === "reddit" && (
          <Field label="Post to subreddit" htmlFor="sr" hint={`Leave empty to post to your profile (u_${account.username ?? "you"}). Follow each subreddit's rules.`}>
            <Input id="sr" placeholder="e.g. SideProject" value={s.subreddit ?? ""} onChange={(e) => setS({ ...s, subreddit: e.target.value.replace(/^\/?r\//, "") })} />
          </Field>
        )}
        {account.platform === "pinterest" && (
          <Field label="Board for new Pins" htmlFor="board">
            <Select id="board" value={s.boardId ?? ""} onChange={(e) => setS({ ...s, boardId: e.target.value })}>
              <option value="">First board</option>
              {account.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {account.platform === "youtube" && (
          <Field label="Default video visibility" htmlFor="priv">
            <Select id="priv" value={s.privacy ?? "public"} onChange={(e) => setS({ ...s, privacy: e.target.value })}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </Select>
          </Field>
        )}
        {account.platform === "tiktok" && (
          <Field label="Preferred visibility" htmlFor="ttp" hint="TikTok only allows the options your account permits. Unaudited apps can only post privately.">
            <Select id="ttp" value={s.tiktokPrivacy ?? "PUBLIC_TO_EVERYONE"} onChange={(e) => setS({ ...s, tiktokPrivacy: e.target.value })}>
              <option value="PUBLIC_TO_EVERYONE">Everyone</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
              <option value="FOLLOWER_OF_CREATOR">Followers</option>
              <option value="SELF_ONLY">Only me</option>
            </Select>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export const ALL_PLATFORMS = PLATFORMS;
