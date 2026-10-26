"use client";
import { LogOut, Monitor, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { CardTitle, GlassCard, Notice } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/utils";

interface Session {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export function SecuritySettings({ email, hasPassword, currentToken }: { email: string; hasPassword: boolean; currentToken: string | null }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const fetchSessions = async () => ((await authClient.listSessions()).data as Session[] | null) ?? [];
  const load = () => fetchSessions().then(setSessions);
  useEffect(() => {
    let alive = true;
    fetchSessions().then((s) => alive && setSessions(s));
    return () => {
      alive = false;
    };
  }, []);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("pw");
    const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword: String(f.get("next")), revokeOtherSessions: true });
    setBusy(null);
    if (error) return toast.error(error.message ?? "Couldn't change the password");
    toast.success("Password changed. Other sessions were signed out.");
    (e.target as HTMLFormElement).reset();
    void load();
  }

  async function deleteAccount() {
    setBusy("del");
    try {
      await api("/account", { method: "DELETE", json: { confirmEmail } });
      toast.success("Your account was deleted");
      router.replace("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {hasPassword ? (
        <GlassCard>
          <CardTitle>Change password</CardTitle>
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Current password" htmlFor="cur">
              <Input id="cur" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password" htmlFor="nxt">
              <Input id="nxt" name="next" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Button type="submit" loading={busy === "pw"}>
              Update
            </Button>
          </form>
        </GlassCard>
      ) : (
        <Notice tone="info">You sign in with Google, so there&apos;s no Verdant password to manage.</Notice>
      )}

      <GlassCard>
        <CardTitle
          description="Devices currently signed in to your account."
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await authClient.revokeOtherSessions();
                toast.success("Signed out everywhere else");
                void load();
              }}
            >
              <LogOut /> Sign out others
            </Button>
          }
        >
          Active sessions
        </CardTitle>
        <ul className="space-y-2">
          {(sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
              <Monitor className="size-4 text-fog" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-mist">{s.userAgent ?? "Unknown device"}</p>
                <p className="text-xs text-stone">
                  {s.ipAddress ?? "unknown IP"} · active {timeAgo(new Date(s.updatedAt))}
                </p>
              </div>
              {s.token === currentToken ? (
                <span className="text-xs text-moss">This device</span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await authClient.revokeSession({ token: s.token });
                    void load();
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
          {sessions?.length === 0 && <li className="text-sm text-fog">No sessions found.</li>}
        </ul>
      </GlassCard>

      <GlassCard className="border-red-400/20">
        <CardTitle description="Deletes your user, every workspace you solely own, stored files, and connected-account tokens. This can't be undone.">Delete account</CardTitle>
        <Button variant="danger" onClick={() => setDel(true)}>
          <Trash2 /> Delete my account
        </Button>
      </GlassCard>

      <Dialog
        open={del}
        onOpenChange={setDel}
        title="Delete your account permanently?"
        description={`Type ${email} to confirm.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDel(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteAccount} loading={busy === "del"} disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase()}>
              Delete forever
            </Button>
          </>
        }
      >
        <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={email} aria-label="Confirm email" />
      </Dialog>
    </div>
  );
}
