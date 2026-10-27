"use client";
import { Check, ChevronDown, CircleDashed, Copy, ExternalLink, EyeOff, Plug, Server, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/misc";
import { PlatformIcon } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { CONNECT_GUIDES, SERVER_GUIDES } from "@/lib/connect-guides";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type StepId = "brand" | "apps" | "post" | "publish" | "autopilot" | "inbox";

export interface SetupGuideProps {
  steps: { id: StepId; done: boolean; skipped: boolean }[];
  connected: Platform[];
  skipped: string[];
  hidden: boolean;
  canManage: boolean;
  platforms: { platform: Platform; configured: boolean; redirectUrl: string }[];
  /** Present for admins only. */
  server: { checks: { id: string; label: string; required: boolean; ok: boolean; detail: string; steps: string[]; envKeys: string[] }[]; baseUrl: string } | null;
}

const STEPS: Record<StepId, { title: string; text: string; href: string; cta: string; how: string[]; optional?: boolean }> = {
  brand: {
    title: "Tell Verdant how you write",
    text: "Who you write for, your tone and a few past posts, so AI drafts sound like you.",
    href: "/brand",
    cta: "Set up brand voice",
    how: ["Open Brand voice.", "Describe who you write for and the tone you like, or press Fill with AI.", "Paste two or three posts you've written before.", "Save. Every AI draft follows it from now on."],
    optional: true,
  },
  apps: { title: "Connect your apps", text: "Link the accounts you post to. Each uses the platform's own sign-in or a token, never your password.", href: "/accounts", cta: "All apps", how: [] },
  post: {
    title: "Create your first post",
    text: "Write an idea or start from a document. AI shapes a version for each platform.",
    href: "/compose",
    cta: "Create post",
    how: ["Open Create post.", "Write your idea, or press Start from: A document.", "Pick the platforms on the right and press Generate platform versions.", "Check each version and its preview, then press Save draft."],
  },
  publish: {
    title: "Publish or schedule it",
    text: "Send it now, or pick a date and time. Each app is tracked separately.",
    href: "/compose",
    cta: "Open Create post",
    how: ["In Create post, tick the accounts under Publish.", "Choose Publish now, or Schedule and pick a date and time.", "Follow it in Queue. The result for each app appears in History."],
  },
  autopilot: {
    title: "Let autopilot answer comments",
    text: "Thank supporters and answer common questions in your voice.",
    href: "/inbox?tab=autopilot",
    cta: "Open Autopilot",
    how: ["Open Inbox → Autopilot.", "Start from a template, e.g. Thank supporters.", "Keep Draft mode at first: replies wait for your approval in the Inbox.", "Switch the rule to Auto when you trust it."],
    optional: true,
  },
  inbox: {
    title: "Reply to a comment",
    text: "Comments and mentions from every app land in one Inbox.",
    href: "/inbox",
    cta: "Open Inbox",
    how: ["Open Inbox. New comments from your apps appear here.", "Pick one, then press Suggest reply or write your own.", "Press Send reply. It posts on the platform as you."],
    optional: true,
  },
};

export function SetupGuide({ steps, connected, skipped: initialSkipped, hidden, canManage, platforms, server }: SetupGuideProps) {
  const router = useRouter();
  const [skipped, setSkipped] = useState(new Set(initialSkipped));
  const [busy, setBusy] = useState<string | null>(null);

  async function update(change: { skip?: string; unskip?: string; hidden?: boolean }, key: string) {
    setBusy(key);
    try {
      await api("/me", { method: "PATCH", json: { setup: change } });
      setSkipped((s) => {
        const next = new Set(s);
        if (change.skip) next.add(change.skip);
        if (change.unskip) next.delete(change.unskip);
        return next;
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  const skip = (id: string) => update({ skip: id }, id);
  const unskip = (id: string) => update({ unskip: id }, id);

  const doneCount = steps.filter((s) => s.done || skipped.has(s.id)).length;

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center gap-4">
        <div className="min-w-48 flex-1">
          <p className="text-sm text-white">
            {doneCount} of {steps.length} steps done
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
            <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>
        {hidden ? (
          <Button variant="glass" size="sm" onClick={() => update({ hidden: false }, "hide")} loading={busy === "hide"}>
            Show in the sidebar again
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => update({ hidden: true }, "hide").then(() => router.push("/dashboard"))} loading={busy === "hide"}>
            <EyeOff /> Hide this guide
          </Button>
        )}
      </GlassCard>

      {server && <ServerSetup {...server} platforms={platforms} skipped={skipped} busy={busy} onSkip={skip} onUnskip={unskip} />}

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const meta = STEPS[s.id];
          const isSkipped = !s.done && skipped.has(s.id);
          return (
            <li key={s.id}>
              <GlassCard className={cn(isSkipped && "opacity-70")}>
                <div className="flex flex-wrap items-start gap-4">
                  <StepBadge n={i + 1} done={s.done} skipped={isSkipped} />
                  <div className="min-w-56 flex-1">
                    <h3 className="font-semibold text-white">
                      {meta.title}
                      {meta.optional && <span className="ml-2 text-xs font-normal text-stone">optional</span>}
                    </h3>
                    <p className="mt-0.5 text-sm text-fog">{meta.text}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.done ? (
                      <span className="inline-flex items-center gap-1 text-sm text-moss">
                        <Check className="size-4" /> Done
                      </span>
                    ) : isSkipped ? (
                      <Button size="sm" variant="ghost" onClick={() => unskip(s.id)} loading={busy === s.id}>
                        <Undo2 /> Undo skip
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => skip(s.id)} loading={busy === s.id}>
                        <SkipForward /> Skip
                      </Button>
                    )}
                    <Button asChild size="sm" variant={s.done ? "glass" : "primary"}>
                      <Link href={meta.href}>{meta.cta}</Link>
                    </Button>
                  </div>
                </div>
                {meta.how.length > 0 && <HowTo steps={meta.how} />}
                {s.id === "apps" && <Apps platforms={platforms} connected={connected} skipped={skipped} canManage={canManage} isAdmin={Boolean(server)} busy={busy} onSkip={skip} onUnskip={unskip} />}
              </GlassCard>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepBadge({ n, done, skipped }: { n: number; done: boolean; skipped: boolean }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold", done ? "bg-moss/20 text-moss" : skipped ? "bg-white/8 text-stone" : "bg-white/12 text-white")} aria-hidden>
      {done ? <Check className="size-4" /> : skipped ? <SkipForward className="size-4" /> : n}
    </span>
  );
}

function HowTo({ steps, label = "How to do it" }: { steps: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-moss hover:underline">
        {label} <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-mist">
          {steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Apps({ platforms, connected, skipped, canManage, isAdmin, busy, onSkip, onUnskip }: { platforms: SetupGuideProps["platforms"]; connected: Platform[]; skipped: Set<string>; canManage: boolean; isAdmin: boolean; busy: string | null; onSkip: (id: string) => void; onUnskip: (id: string) => void }) {
  const [open, setOpen] = useState<Platform | null>(null);
  // Customers only see apps they can actually connect; admins also see the ones still to set up.
  const visible = PLATFORMS.filter((p) => {
    const info = platforms.find((x) => x.platform === p);
    return isAdmin || connected.includes(p) || PLATFORM_META[p].connection === "credentials" || info?.configured;
  });
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm text-fog">Pick the apps you post to. Open “How to connect” for a short walkthrough before you start.</p>
      <ul className="divide-y divide-white/6 rounded-xl bg-black/20">
        {visible.map((p) => {
          const meta = PLATFORM_META[p];
          const info = platforms.find((x) => x.platform === p)!;
          const isConnected = connected.includes(p);
          const available = meta.connection === "credentials" || info.configured;
          const id = `app:${p}`;
          const isSkipped = !isConnected && skipped.has(id);
          const guide = CONNECT_GUIDES[p];
          return (
            <li key={p} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <PlatformIcon platform={p} className={cn("size-4", isConnected ? "text-moss" : "text-fog")} />
                <span className={cn("min-w-28 flex-1 text-sm", isSkipped ? "text-stone line-through" : "text-white")}>{meta.label}</span>
                {isConnected ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs text-moss">
                      <Check className="size-3.5" /> Connected
                    </span>
                    <Link href={`/channels/${p}`} className="text-xs text-fog hover:text-white">
                      Open
                    </Link>
                  </>
                ) : !available ? (
                  <>
                    <span className="text-xs text-stone">Add its developer app in Server setup first (only admins see this)</span>
                    <button onClick={() => setOpen(open === p ? null : p)} aria-expanded={open === p} className="inline-flex items-center gap-1 text-xs text-moss hover:underline">
                      Preview walkthrough <ChevronDown className={cn("size-3.5 transition", open === p && "rotate-180")} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setOpen(open === p ? null : p)} aria-expanded={open === p} className="inline-flex items-center gap-1 text-xs text-moss hover:underline">
                      How to connect <ChevronDown className={cn("size-3.5 transition", open === p && "rotate-180")} />
                    </button>
                    {isSkipped ? (
                      <Button size="sm" variant="ghost" onClick={() => onUnskip(id)} loading={busy === id}>
                        <Undo2 /> Undo
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => onSkip(id)} loading={busy === id}>
                        Skip
                      </Button>
                    )}
                    {canManage && (
                      <Button asChild size="sm" variant="glass">
                        <Link href={`/accounts?connect=${p}`}>
                          <Plug /> Connect
                        </Link>
                      </Button>
                    )}
                  </>
                )}
              </div>
              {open === p && <Lesson platform={p} guide={guide} canManage={canManage} preview={!available} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A short walkthrough for connecting one app, written for someone doing it for the first time. */
function Lesson({ platform, guide, canManage, preview }: { platform: Platform; guide: (typeof CONNECT_GUIDES)[Platform]; canManage: boolean; preview: boolean }) {
  const label = PLATFORM_META[platform].label;
  return (
    <div className="mt-3 space-y-4 rounded-xl bg-black/25 p-4 text-sm">
      <p className="text-mist">{guide.what}</p>
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-stone">Before you start</h4>
        <ul className="mt-1.5 space-y-1 text-mist">
          {guide.need.map((x) => (
            <li key={x} className="flex gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-moss" /> {x}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-stone">Step by step</h4>
        <ol className="mt-2 space-y-2.5">
          {guide.steps.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss/15 text-xs font-semibold text-moss">{i + 1}</span>
              <span>
                <span className="block font-medium text-white">{st.title}</span>
                <span className="block text-fog">{st.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-stone">What you&apos;re allowing</h4>
        <p className="mt-1 text-fog">{guide.permissions}</p>
      </section>
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-stone">After connecting</h4>
        <p className="mt-1 text-fog">{guide.after}</p>
      </section>
      {guide.note && <p className="rounded-lg bg-sun/10 px-3 py-2 text-xs text-sun">{guide.note}</p>}
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-stone">If something goes wrong</h4>
        <dl className="mt-1.5 space-y-2">
          {guide.trouble.map((t) => (
            <div key={t.q}>
              <dt className="text-mist">{t.q}</dt>
              <dd className="text-fog">{t.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      {preview ? (
        <p className="text-xs text-stone">Preview: customers see this walkthrough with a Connect button once {label}&apos;s app keys are set in Server setup.</p>
      ) : canManage ? (
        <Button asChild size="sm">
          <Link href={`/accounts?connect=${platform}`}>
            <Plug /> Connect {label} now
          </Link>
        </Button>
      ) : (
        <p className="text-xs text-stone">Only workspace admins can connect accounts. Ask your workspace owner to do it.</p>
      )}
    </div>
  );
}

function ServerSetup({ checks, baseUrl, platforms, skipped, busy, onSkip, onUnskip }: NonNullable<SetupGuideProps["server"]> & { platforms: SetupGuideProps["platforms"]; skipped: Set<string>; busy: string | null; onSkip: (id: string) => void; onUnskip: (id: string) => void }) {
  const pending = checks.filter((c) => c.required && !c.ok && !skipped.has(`server:${c.id}`)).length;
  const [open, setOpen] = useState(pending > 0);
  const copy = (v: string) => void navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  return (
    <GlassCard>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-9 place-items-center rounded-full bg-sun/15 text-sun">
          <Server className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-white">Server setup</span>
          <span className="block text-sm text-fog">Only admins see this. {pending ? `${pending} required item${pending === 1 ? "" : "s"} left.` : "Everything required is set."} Changes to environment variables need a redeploy.</span>
        </span>
        <ChevronDown className={cn("size-5 text-fog transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {checks.map((c) => {
            const id = `server:${c.id}`;
            const isSkipped = !c.ok && skipped.has(id);
            return (
              <div key={c.id} className="rounded-xl bg-black/20 p-3">
                <div className="flex flex-wrap items-start gap-3">
                  {c.ok ? <Check className="mt-0.5 size-4 text-moss" /> : <CircleDashed className={cn("mt-0.5 size-4", c.required && !isSkipped ? "text-sun" : "text-stone")} />}
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium text-white">
                      {c.label}
                      {!c.required && <span className="ml-2 text-xs font-normal text-stone">optional</span>}
                    </p>
                    <p className="text-xs text-fog">{c.detail}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.envKeys.map((k) => (
                        <code key={k} className="rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-mist">
                          {k}
                        </code>
                      ))}
                    </div>
                  </div>
                  {!c.ok &&
                    (isSkipped ? (
                      <Button size="sm" variant="ghost" onClick={() => onUnskip(id)} loading={busy === id}>
                        <Undo2 /> Undo skip
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => onSkip(id)} loading={busy === id}>
                        Skip
                      </Button>
                    ))}
                </div>
                {!c.ok && <HowTo steps={c.steps} label="How to set it up" />}
              </div>
            );
          })}

          <div className="rounded-xl bg-black/20 p-3">
            <p className="text-sm font-medium text-white">Platform developer apps</p>
            <p className="text-xs text-fog">Each sign-in platform needs a developer app with this exact redirect URL. Bluesky, Mastodon, Telegram, Discord, WordPress and Custom website need no server setup.</p>
            <ul className="mt-3 space-y-2">
              {platforms
                .filter((x) => SERVER_GUIDES[x.platform])
                .map((x) => {
                  const g = SERVER_GUIDES[x.platform]!;
                  return (
                    <li key={x.platform} className="rounded-lg bg-black/20 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlatformIcon platform={x.platform} className="size-4 text-fog" />
                        <span className="flex-1 text-sm text-white">{PLATFORM_META[x.platform].label}</span>
                        {x.configured ? (
                          <span className="inline-flex items-center gap-1 text-xs text-moss">
                            <Check className="size-3.5" /> Keys set
                          </span>
                        ) : (
                          <a href={g.portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-moss hover:underline">
                            Developer portal <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {!x.configured && (
                        <div className="mt-2 text-xs text-fog">
                          <button onClick={() => copy(x.redirectUrl)} className="flex max-w-full items-center gap-1.5 rounded bg-white/6 px-2 py-1 text-left font-mono text-[11px] text-mist hover:bg-white/10" title="Copy redirect URL">
                            <Copy className="size-3 shrink-0" />
                            <span className="truncate">{x.redirectUrl}</span>
                          </button>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {g.envKeys.map((k) => (
                              <code key={k} className="rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-mist">
                                {k}
                              </code>
                            ))}
                          </div>
                          <HowTo steps={g.steps} label="Steps" />
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
            <p className="mt-3 text-xs text-stone">
              App reviews also ask for {baseUrl}/privacy, {baseUrl}/terms and {baseUrl}/data-deletion. Full details: docs/PLATFORMS.md.
            </p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
