"use client";
import { AlertTriangle, CalendarClock, ChevronDown, ExternalLink, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, GlassCard } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { PlatformBadge, StatusBadge } from "@/components/ui/platform";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { Platform } from "@/lib/platforms";
import { formatInZone, utcToZonedLocal } from "@/lib/time";
import { cn, timeAgo } from "@/lib/utils";

export interface JobRow {
  id: string;
  platform: Platform;
  status: string;
  scheduledAt: string;
  timezone: string;
  attemptCount: number;
  nextRetryAt: string | null;
  completedAt: string | null;
  publishedUrl: string | null;
  externalPostId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  correlationId: string;
  updatedAt: string;
  preview: string;
  content: { id: string; title: string };
  account: { displayName: string; username: string | null };
}

interface Attempt {
  id: string;
  attemptNumber: number;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  platformRequestId: string | null;
  durationMs: number | null;
}

const HINT: Record<string, string> = {
  auth: "The connection expired or was revoked. Reconnect the account, then retry.",
  permission: "The platform denied permission. Check the app's products/scopes or your account type.",
  validation: "The platform rejected the content. Edit the post (duplicate it if this variant was published elsewhere).",
  media: "The platform couldn't process the media. Check format, size and aspect ratio.",
  rate_limit: "The platform's rate limit was reached.",
  transient: "A temporary platform error.",
  ambiguous: "We couldn't confirm whether the post went live. Check your profile before retrying.",
  interrupted: "Publishing was interrupted. Check your profile before retrying.",
  account_disconnected: "The account was disconnected before publishing.",
};

export function JobsList({ items, timezone, mode, emptyText }: { items: JobRow[]; timezone: string; mode: "queue" | "history"; emptyText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRetry, setConfirmRetry] = useState<JobRow | null>(null);
  const [resched, setResched] = useState<{ job: JobRow; when: string } | null>(null);

  async function toggle(id: string) {
    setOpen((o) => (o === id ? null : id));
    if (!attempts[id]) {
      try {
        const r = await api<{ attempts: Attempt[] }>(`/publishing-jobs/${id}/attempts`);
        setAttempts((a) => ({ ...a, [id]: r.attempts }));
      } catch {
        /* optional detail */
      }
    }
  }

  async function act(id: string, path: string, json?: unknown, ok?: string) {
    setBusy(id + path);
    try {
      await api(`/publishing-jobs/${id}/${path}`, { method: "POST", json: json ?? {} });
      if (ok) toast.success(ok);
      router.refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "confirm_required") {
        setConfirmRetry(items.find((i) => i.id === id) ?? null);
        return false;
      }
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return <GlassCard><EmptyState icon={<CalendarClock />} title={emptyText} /></GlassCard>;

  return (
    <GlassCard className="p-2">
      <ul className="divide-y divide-white/6">
        {items.map((j) => {
          const failed = j.status === "failed" || j.status === "needs_reconnection";
          return (
            <li key={j.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <PlatformBadge platform={j.platform} />
                <div className="min-w-0 flex-1">
                  <Link href={`/compose?id=${j.content.id}`} className="block truncate text-sm font-medium text-white hover:underline">
                    {j.content.title}
                  </Link>
                  <p className="truncate text-xs text-stone">
                    {j.account.displayName} · {mode === "queue" ? formatInZone(j.scheduledAt, timezone, "EEE d MMM, HH:mm") : timeAgo(j.completedAt ?? j.updatedAt)}
                    {j.nextRetryAt && j.status === "queued" && ` · retry ${timeAgo(j.nextRetryAt)}`}
                    {j.attemptCount > 0 && ` · ${j.attemptCount} attempt${j.attemptCount > 1 ? "s" : ""}`}
                  </p>
                </div>
                <StatusBadge status={j.status} />
                <div className="flex items-center gap-1">
                  {j.publishedUrl && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={j.publishedUrl} target="_blank" rel="noreferrer">
                        View <ExternalLink />
                      </a>
                    </Button>
                  )}
                  {j.status === "scheduled" && (
                    <Button size="sm" variant="ghost" onClick={() => setResched({ job: j, when: utcToZonedLocal(new Date(j.scheduledAt), timezone) })}>
                      <CalendarClock /> Reschedule
                    </Button>
                  )}
                  {["queued", "scheduled", "needs_reconnection"].includes(j.status) && (
                    <Button size="sm" variant="ghost" loading={busy === `${j.id}cancel`} onClick={() => act(j.id, "cancel", undefined, "Cancelled")}>
                      <XCircle /> Cancel
                    </Button>
                  )}
                  {failed && !["validation", "permission", "media"].includes(j.lastErrorCode ?? "") && (
                    <Button size="sm" variant="glass" loading={busy === `${j.id}retry`} onClick={() => act(j.id, "retry", undefined, "Queued for retry")}>
                      <RotateCcw /> Retry
                    </Button>
                  )}
                  <button onClick={() => toggle(j.id)} className="rounded-lg p-1.5 text-fog hover:bg-white/10" aria-expanded={open === j.id} aria-label="Details">
                    <ChevronDown className={cn("size-4 transition", open === j.id && "rotate-180")} />
                  </button>
                </div>
              </div>
              {failed && j.lastErrorMessage && (
                <div className="mt-2 flex gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {j.lastErrorMessage}
                    {j.lastErrorCode && HINT[j.lastErrorCode] && <span className="mt-0.5 block text-red-100/70">{HINT[j.lastErrorCode]}</span>}
                    {j.lastErrorCode === "auth" && (
                      <Link href="/accounts" className="mt-1 inline-block underline">
                        Reconnect account
                      </Link>
                    )}
                  </span>
                </div>
              )}
              {open === j.id && (
                <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3 text-xs text-fog">
                  <p className="whitespace-pre-wrap text-mist">{j.preview || "(no text)"}</p>
                  <p>
                    Scheduled {formatInZone(j.scheduledAt, j.timezone, "d MMM yyyy HH:mm")} ({j.timezone}) · Trace ID <code className="text-stone">{j.correlationId.slice(0, 8)}</code>
                    {j.externalPostId && (
                      <>
                        {" "}
                        · Platform ID <code className="text-stone">{j.externalPostId}</code>
                      </>
                    )}
                  </p>
                  {(attempts[j.id] ?? []).length > 0 && (
                    <table className="w-full text-left">
                      <thead className="text-stone">
                        <tr>
                          <th className="py-1 font-normal">#</th>
                          <th className="font-normal">Started</th>
                          <th className="font-normal">Outcome</th>
                          <th className="font-normal">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts[j.id]!.map((a) => (
                          <tr key={a.id} className="border-t border-white/5 align-top">
                            <td className="py-1">{a.attemptNumber}</td>
                            <td>{formatInZone(a.startedAt, timezone, "d MMM HH:mm:ss")}</td>
                            <td>{a.outcome?.replace(/_/g, " ") ?? "running"}</td>
                            <td className="max-w-md">
                              {a.errorMessage ?? (a.outcome === "success" ? "Confirmed by platform" : "")}
                              {a.httpStatus ? ` (HTTP ${a.httpStatus})` : ""}
                              {a.durationMs ? ` · ${(a.durationMs / 1000).toFixed(1)}s` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(confirmRetry)}
        onOpenChange={(o) => !o && setConfirmRetry(null)}
        title="Check before retrying"
        description="We couldn't confirm whether this post was published. Retrying might create a duplicate. Open your profile and confirm it isn't there."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRetry(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (confirmRetry && (await act(confirmRetry.id, "retry", { confirmNotPublished: true }, "Queued for retry"))) setConfirmRetry(null);
              }}
            >
              It&apos;s not on my profile. Retry
            </Button>
          </>
        }
      />
      <Dialog
        open={Boolean(resched)}
        onOpenChange={(o) => !o && setResched(null)}
        title="Reschedule"
        description={`Time zone: ${resched?.job.timezone ?? timezone}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResched(null)}>
              Cancel
            </Button>
            <Button
              loading={busy === `${resched?.job.id}reschedule`}
              onClick={async () => {
                if (resched && (await act(resched.job.id, "reschedule", { scheduledAtLocal: resched.when, timezone: resched.job.timezone }, "Rescheduled"))) setResched(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {resched && (
          <Field label="New date & time" htmlFor="rs">
            <Input id="rs" type="datetime-local" value={resched.when} onChange={(e) => setResched({ ...resched, when: e.target.value })} />
          </Field>
        )}
      </Dialog>
    </GlassCard>
  );
}
