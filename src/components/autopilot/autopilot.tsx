"use client";
import { Bot, Pencil, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/field";
import { EmptyState, GlassCard, Notice } from "@/components/ui/misc";
import { Dialog, Switch } from "@/components/ui/overlay";
import { PlatformIcon } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import type { Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  socialAccountIds: string[];
  trigger: "all" | "keywords" | "mentions" | "questions";
  keywords: string[];
  instructions: string | null;
  mode: "draft" | "auto";
  dailyLimit: number;
  skipNegative: boolean;
  brandProfileId: string | null;
}

const TRIGGERS: Record<Rule["trigger"], string> = {
  all: "Every new comment",
  questions: "Comments that ask a question",
  keywords: "Comments containing keywords",
  mentions: "Posts that mention me",
};

const TEMPLATES: Omit<Rule, "id" | "socialAccountIds" | "brandProfileId">[] = [
  { name: "Thank supporters", enabled: true, trigger: "all", keywords: [], instructions: "Thank people warmly and specifically for what they said. Keep it to one or two sentences.", mode: "draft", dailyLimit: 50, skipNegative: true },
  { name: "Answer questions", enabled: true, trigger: "questions", keywords: [], instructions: "Answer only if the answer is clearly in the post. Otherwise say you'll follow up soon.", mode: "draft", dailyLimit: 30, skipNegative: true },
  { name: "Link requests", enabled: true, trigger: "keywords", keywords: ["link", "where can i", "how do i join"], instructions: "Point people to the link in the post or profile. Don't paste new URLs.", mode: "draft", dailyLimit: 30, skipNegative: true },
];

export function Autopilot({ rules, accounts, brands }: { rules: Rule[]; accounts: { id: string; platform: Platform; displayName: string }[]; brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {
        name: editing.name ?? "Rule",
        enabled: editing.enabled ?? true,
        socialAccountIds: editing.socialAccountIds ?? [],
        trigger: editing.trigger ?? "all",
        keywords: editing.keywords ?? [],
        instructions: editing.instructions || null,
        mode: editing.mode ?? "draft",
        dailyLimit: editing.dailyLimit ?? 50,
        skipNegative: editing.skipNegative ?? true,
        brandProfileId: editing.brandProfileId || null,
      };
      if (editing.id) await api(`/autopilot/rules/${editing.id}`, { method: "PATCH", json: body });
      else await api("/autopilot/rules", { method: "POST", json: body });
      toast.success("Rule saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: Rule) {
    try {
      await api(`/autopilot/rules/${r.id}`, { method: "PATCH", json: { ...r, enabled: !r.enabled } });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    await api(`/autopilot/rules/${r.id}`, { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Notice tone="info" title="How autopilot stays safe">
        It never replies to spam, abuse or your own comments. Negative comments go to you for review, and each rule has a daily cap and replies to a person at most once a day per post. Start in{" "}
        <strong>Draft</strong> mode to approve replies in the Inbox, then switch to <strong>Auto</strong> when you trust it.
      </Notice>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ enabled: true, trigger: "all", mode: "draft", dailyLimit: 50, skipNegative: true, keywords: [], socialAccountIds: [] })}>
          <Plus /> New rule
        </Button>
        {TEMPLATES.map((t) => (
          <Button key={t.name} variant="glass" onClick={() => setEditing({ ...t, socialAccountIds: [] })}>
            <Zap /> {t.name}
          </Button>
        ))}
      </div>

      {rules.length === 0 ? (
        <GlassCard>
          <EmptyState icon={<Bot />} title="No autopilot rules yet" description="Start from a template above. Rules can draft replies for approval or answer automatically." />
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rules.map((r) => (
            <GlassCard key={r.id} className={cn(!r.enabled && "opacity-60")}>
              <div className="flex items-start gap-3">
                <span className={cn("grid size-10 place-items-center rounded-xl", r.mode === "auto" ? "bg-moss/20 text-moss" : "bg-white/10 text-fog")}>
                  <Bot className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white">{r.name}</h3>
                  <p className="text-sm text-fog">
                    {TRIGGERS[r.trigger]}
                    {r.trigger === "keywords" && `: ${r.keywords.join(", ")}`}
                  </p>
                </div>
                <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} label={`Enable ${r.name}`} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className={cn("rounded-full px-2.5 py-0.5", r.mode === "auto" ? "bg-moss/15 text-moss" : "bg-sky-400/15 text-sky-200")}>{r.mode === "auto" ? "Replies automatically" : "Drafts for approval"}</span>
                <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-fog">Max {r.dailyLimit}/day</span>
                {r.skipNegative && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-0.5 text-fog">
                    <ShieldCheck className="size-3" /> Negative → review
                  </span>
                )}
                <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-fog">{r.socialAccountIds.length ? `${r.socialAccountIds.length} account(s)` : "All accounts"}</span>
              </div>
              {r.instructions && <p className="mt-3 line-clamp-2 text-xs italic text-stone">“{r.instructions}”</p>}
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {editing && (
        <Dialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={editing.id ? "Edit rule" : "New autopilot rule"}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy}>
                Save rule
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="rn">
              <Input id="rn" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="When" htmlFor="rt">
              <Select id="rt" value={editing.trigger ?? "all"} onChange={(e) => setEditing({ ...editing, trigger: e.target.value as Rule["trigger"] })}>
                {Object.entries(TRIGGERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            {editing.trigger === "keywords" && (
              <Field label="Keywords" htmlFor="rk" className="sm:col-span-2">
                <TagInput id="rk" value={editing.keywords ?? []} onChange={(k) => setEditing({ ...editing, keywords: k })} placeholder="price, link, join…" />
              </Field>
            )}
            <Field label="Mode" htmlFor="rm">
              <Select id="rm" value={editing.mode ?? "draft"} onChange={(e) => setEditing({ ...editing, mode: e.target.value as Rule["mode"] })}>
                <option value="draft">Draft replies for my approval</option>
                <option value="auto">Reply automatically</option>
              </Select>
            </Field>
            <Field label="Daily limit" htmlFor="rl">
              <Input id="rl" type="number" min={1} max={500} value={editing.dailyLimit ?? 50} onChange={(e) => setEditing({ ...editing, dailyLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Brand voice" htmlFor="rb">
              <Select id="rb" value={editing.brandProfileId ?? ""} onChange={(e) => setEditing({ ...editing, brandProfileId: e.target.value || null })}>
                <option value="">Workspace default</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm text-fog">
              <Switch checked={editing.skipNegative ?? true} onCheckedChange={(v) => setEditing({ ...editing, skipNegative: v })} label="Send negative comments to review" />
              Send negative comments to me
            </label>
            <Field label="Instructions for replies" htmlFor="ri" className="sm:col-span-2" hint="Tell the AI what to say, what not to promise, and your sign-off style.">
              <Textarea id="ri" rows={3} value={editing.instructions ?? ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[13px] font-medium text-fog">Accounts (none selected = all that support replies)</p>
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = (editing.socialAccountIds ?? []).includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setEditing({ ...editing, socialAccountIds: on ? (editing.socialAccountIds ?? []).filter((x) => x !== a.id) : [...(editing.socialAccountIds ?? []), a.id] })}
                      className={cn("flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm", on ? "border-moss/50 bg-moss/10 text-white" : "border-white/15 text-fog")}
                    >
                      <PlatformIcon platform={a.platform} className="size-3.5" /> {a.displayName}
                    </button>
                  );
                })}
                {accounts.length === 0 && <p className="text-sm text-stone">Connect an account that supports replies first.</p>}
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
