"use client";
import { AlertTriangle, CalendarClock, Check, ClipboardCopy, ExternalLink, FileScan, Gauge, Hash, ImagePlus, Lock, Save, Send, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/field";
import { CardTitle, GlassCard, Notice } from "@/components/ui/misc";
import { Dialog, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { PlatformBadge, PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { finalPostText, PLATFORM_META, PLATFORMS, platformLimits, textLength, validateMedia, type Platform, type ValidationIssue } from "@/lib/platforms";
import { checkQuality } from "@/lib/quality";
import { COMMON_TIMEZONES } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EMOJI, HASHTAG_PREF, LENGTHS, TONES, TONE_LABEL, type WritingControls } from "@/lib/writing";
import { DiffDialog, type RewriteResult } from "./diff-dialog";
import { DocumentImport } from "./document-import";
import { ImageLab } from "./image-lab";
import { MediaPicker } from "./media-picker";
import { PlatformPreview } from "./preview";
import type { AccountOption, BrandOption, JobSummary, MediaItem, VariantState } from "./types";

export interface ComposerInitial {
  id: string | null;
  title: string;
  body: string;
  linkUrl: string | null;
  hashtags: string[];
  callToAction: string | null;
  campaign: string | null;
  tags: string[];
  brandProfileId: string | null;
  media: MediaItem[];
  variants: Partial<Record<Platform, VariantState>>;
  jobs: JobSummary[];
  status: string;
}

interface Props {
  initial: ComposerInitial;
  accounts: AccountOption[];
  brands: BrandOption[];
  timezone: string;
  /** Suggested schedule time (local wall time in `timezone`), computed on the server. */
  defaultScheduleLocal: string;
  xMaxLength: number;
  aiAvailable: boolean;
  /** Open a starting tool on load (from the dashboard or a notification link). */
  startWith: Tool | null;
  initialDocumentId: string | null;
  documents: { maxMb: number; retentionDays: number; aiReady: boolean };
  /** False when REDIS_URL is unset: jobs are saved but the background worker can't send them. */
  workerReady: boolean;
}

type Mode = "now" | "schedule";
export type Tool = "document" | "image";
interface Critique {
  score: number;
  issues: { severity: string; message: string; quote?: string }[];
}

export function Composer({ initial, accounts, brands, timezone, defaultScheduleLocal, xMaxLength, aiAvailable, startWith, initialDocumentId, documents, workerReady }: Props) {
  const router = useRouter();
  const [contentId, setContentId] = useState(initial.id);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? "");
  const [cta, setCta] = useState(initial.callToAction ?? "");
  const [campaign, setCampaign] = useState(initial.campaign ?? "");
  const [tags, setTags] = useState(initial.tags);
  const [brandId, setBrandId] = useState(initial.brandProfileId ?? brands.find((b) => b.isDefault)?.id ?? "");
  const [media, setMedia] = useState<MediaItem[]>(initial.media);
  const [platforms, setPlatforms] = useState<Platform[]>(
    Object.keys(initial.variants).length ? (Object.keys(initial.variants) as Platform[]) : [...new Set(accounts.filter((a) => a.status === "connected").map((a) => a.platform))].slice(0, 3),
  );
  const [variants, setVariants] = useState<Partial<Record<Platform, VariantState>>>(initial.variants);
  const [active, setActive] = useState<Platform>(platforms[0] ?? "linkedin");
  const [controls, setControls] = useState<Partial<WritingControls>>({ tone: undefined, length: "medium", emoji: undefined, hashtags: undefined });
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(accounts.filter((a) => a.status === "connected" && platforms.includes(a.platform)).map((a) => a.id));
  const [mode, setMode] = useState<Mode>("schedule");
  const [when, setWhen] = useState(defaultScheduleLocal);
  const [tz, setTz] = useState(timezone);
  const [busy, setBusy] = useState<null | string>(null);
  const [rewrite, setRewrite] = useState<(RewriteResult & { target: Platform | "master" }) | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(startWith);
  const [critiques, setCritiques] = useState<Partial<Record<Platform, Critique>>>({});
  const idemKey = useRef<string | null>(null);

  const lockedPlatforms = new Set(initial.jobs.filter((j) => j.status === "published" || j.status === "processing").map((j) => j.platform));
  const getVariant = (p: Platform): VariantState => variants[p] ?? { body: "", hashtags: [], includeMedia: true, aiGenerated: false };
  const setVariant = (p: Platform, patch: Partial<VariantState>) => setVariants((v) => ({ ...v, [p]: { ...getVariant(p), ...patch } }));

  function togglePlatform(p: Platform) {
    setPlatforms((cur) => {
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
      if (!next.includes(active) && next[0]) setActive(next[0]);
      if (!cur.includes(p)) {
        setActive(p);
        if (!variants[p]?.body && body) setVariant(p, { body });
      }
      setSelectedAccounts((ids) => (cur.includes(p) ? ids.filter((id) => accounts.find((a) => a.id === id)?.platform !== p) : ids));
      return next;
    });
  }

  const aiBase = () => ({ brandProfileId: brandId || null, controls: Object.fromEntries(Object.entries({ ...controls, callToAction: cta || undefined }).filter(([, v]) => v !== undefined)), contentId });

  async function generate() {
    if (!body.trim()) return toast.error("Write your idea or draft in the main content box first.");
    if (!platforms.length) return toast.error("Pick at least one platform.");
    setBusy("generate");
    setAiNote(null);
    try {
      const r = await api<{ variants: { platform: Platform; text: string; hashtags: string[]; issues: ValidationIssue[] }[]; notes: string | null; provider: string; model: string }>("/ai/generate", {
        method: "POST",
        json: { ...aiBase(), idea: body, platforms, link: linkUrl || null },
      });
      setVariants((v) => {
        const next = { ...v };
        for (const x of r.variants) if (!lockedPlatforms.has(x.platform)) next[x.platform] = { ...(v[x.platform] ?? { includeMedia: true }), body: x.text, hashtags: x.hashtags, aiGenerated: true } as VariantState;
        return next;
      });
      setAiNote(`Generated with ${r.provider === "groq" ? "Groq" : "Gemini"} · ${r.model}.${r.notes ? ` Note: ${r.notes}` : ""} Review each version before publishing.`);
      toast.success("Platform versions are ready to edit");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function runRewrite(operation: string, target: Platform | "master") {
    const text = target === "master" ? body : getVariant(target).body;
    if (!text.trim()) return toast.error("There's nothing to rewrite yet.");
    setBusy(`rw-${operation}`);
    try {
      const r = await api<RewriteResult>("/ai/rewrite", { method: "POST", json: { ...aiBase(), text, operation, platform: target === "master" ? undefined : target } });
      setRewrite({ ...r, target });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function hashtags(p: Platform) {
    const v = getVariant(p);
    if (!v.body.trim()) return;
    setBusy("tags");
    try {
      const r = await api<{ hashtags: string[] }>("/ai/hashtags", { method: "POST", json: { text: v.body, platform: p, count: p === "instagram" ? 8 : 3 } });
      setVariant(p, { hashtags: [...new Set([...v.hashtags, ...r.hashtags])] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function critique(p: Platform) {
    const text = finalPostText(p, getVariant(p).body, getVariant(p).hashtags, linkUrl || null);
    if (!text.trim()) return;
    setBusy("critique");
    try {
      const r = await api<Critique>("/ai/critique", { method: "POST", json: { text, platform: p } });
      setCritiques((c) => ({ ...c, [p]: r }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const payload = () => ({
    title: title.trim() || "Untitled post",
    body,
    linkUrl: linkUrl.trim() || null,
    hashtags: [],
    callToAction: cta || null,
    campaign: campaign || null,
    tags,
    brandProfileId: brandId || null,
    mediaIds: media.map((m) => m.id),
    aiGenerated: platforms.some((p) => getVariant(p).aiGenerated),
    variants: platforms
      .filter((p) => !lockedPlatforms.has(p))
      .map((p) => {
        const { body: vb, hashtags: vh, includeMedia, aiGenerated } = getVariant(p);
        return { platform: p, body: vb, hashtags: vh, includeMedia, aiGenerated };
      }),
  });

  async function save(silent = false): Promise<string | null> {
    setBusy((b) => b ?? "save");
    try {
      if (contentId) {
        await api(`/content/${contentId}`, { method: "PATCH", json: payload() });
        if (!silent) toast.success("Draft saved");
        return contentId;
      }
      const r = await api<{ content: { id: string } }>("/content", { method: "POST", json: payload() });
      setContentId(r.content.id);
      window.history.replaceState(null, "", `/compose?id=${r.content.id}`);
      if (!silent) toast.success("Draft saved");
      return r.content.id;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusy((b) => (b === "save" ? null : b));
    }
  }

  async function publish() {
    if (!selectedAccounts.length) return toast.error("Choose at least one connected account.");
    setBusy("publish");
    try {
      const id = await save(true);
      if (!id) return;
      idemKey.current ??= crypto.randomUUID();
      const r = await api<{ jobs: { id: string }[]; skipped: { reason: string }[] }>("/publishing-jobs", {
        method: "POST",
        idempotencyKey: idemKey.current,
        json: { contentId: id, targets: selectedAccounts.map((socialAccountId) => ({ socialAccountId })), mode, scheduledAtLocal: mode === "schedule" ? when : undefined, timezone: tz },
      });
      idemKey.current = null;
      if (r.jobs.length) toast.success(mode === "now" ? `Publishing to ${r.jobs.length} destination${r.jobs.length > 1 ? "s" : ""}…` : `Scheduled for ${when.replace("T", " ")} (${tz})`);
      if (r.skipped.length) toast.message(`${r.skipped.length} destination(s) skipped: ${r.skipped[0]!.reason}`);
      router.push(mode === "now" ? `/history?content=${id}` : "/queue");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 409) idemKey.current = null;
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const issuesFor = (p: Platform) => {
    const v = getVariant(p);
    const m = v.includeMedia ? media : [];
    const text = finalPostText(p, v.body, v.hashtags, linkUrl || null);
    return [...checkQuality({ text, platform: p, sourceText: body, mediaCount: m.length, xMaxLength }).issues, ...validateMedia(p, m)];
  };
  const blocking = platforms.flatMap((p) => issuesFor(p).filter((i) => i.level === "error").map((i) => ({ p, ...i })));
  const accountsByPlatform = (p: Platform) => accounts.filter((a) => a.platform === p);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Left: source + settings */}
      <div className="space-y-4">
        <GlassCard>
          <div className="mb-3 flex items-center gap-3">
            <Input aria-label="Internal label" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Internal label (only you see this)" className="h-9 border-transparent bg-transparent px-0 text-lg font-semibold focus:bg-black/20 focus:px-3" />
            {initial.status !== "draft" && <StatusBadge status={initial.status} />}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone">Start from:</span>
            <Button size="sm" variant="glass" onClick={() => setTool("document")}>
              <FileScan /> A document
            </Button>
            <Button size="sm" variant="glass" onClick={() => setTool("image")}>
              <ImagePlus /> An AI image
            </Button>
          </div>
          <Field label="Main content: your idea, notes or full draft" htmlFor="master">
            <Textarea id="master" rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Finished my Google Data Analytics certificate: 8 courses, capstone on why bike-share riders churn. Learned SQL + R properly for the first time." />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={generate} loading={busy === "generate"} disabled={!aiAvailable || !!busy}>
              <Sparkles /> Generate platform versions
            </Button>
            {(["improve", "humanize", "shorten", "expand"] as const).map((op) => (
              <Button key={op} size="sm" variant="glass" onClick={() => runRewrite(op, "master")} loading={busy === `rw-${op}`} disabled={!aiAvailable || !!busy}>
                {op === "improve" && <Wand2 />}
                {op === "humanize" ? "Humanize" : op[0]!.toUpperCase() + op.slice(1)}
              </Button>
            ))}
          </div>
          {!aiAvailable && <p className="mt-2 text-xs text-sun">AI isn&apos;t configured on this server. You can still write and publish manually.</p>}
          {aiNote && <p className="mt-3 text-xs text-fog">{aiNote}</p>}
        </GlassCard>

        <GlassCard>
          <CardTitle description="Brand defaults apply where you leave Auto.">Writing controls</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand voice" htmlFor="brand">
              <Select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tone" htmlFor="tone">
              <Select id="tone" value={controls.tone ?? ""} onChange={(e) => setControls((c) => ({ ...c, tone: (e.target.value || undefined) as WritingControls["tone"] }))}>
                <option value="">Auto (brand)</option>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Length" htmlFor="length">
              <Select id="length" value={controls.length} onChange={(e) => setControls((c) => ({ ...c, length: e.target.value as WritingControls["length"] }))}>
                {LENGTHS.map((l) => (
                  <option key={l} value={l}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Audience (optional)" htmlFor="audience">
              <Input id="audience" value={controls.audience ?? ""} onChange={(e) => setControls((c) => ({ ...c, audience: e.target.value || undefined }))} placeholder="e.g. hiring managers in data" maxLength={200} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emoji" htmlFor="emoji">
                <Select id="emoji" value={controls.emoji ?? ""} onChange={(e) => setControls((c) => ({ ...c, emoji: (e.target.value || undefined) as WritingControls["emoji"] }))}>
                  <option value="">Auto</option>
                  {EMOJI.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hashtags" htmlFor="htp">
                <Select id="htp" value={controls.hashtags ?? ""} onChange={(e) => setControls((c) => ({ ...c, hashtags: (e.target.value || undefined) as WritingControls["hashtags"] }))}>
                  <option value="">Auto</option>
                  {HASHTAG_PREF.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Link (optional)" htmlFor="link" hint="Added to LinkedIn and X posts. Instagram captions can't have clickable links.">
              <Input id="link" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Call to action (optional)" htmlFor="cta">
              <Input id="cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Read the case study" />
            </Field>
            <Field label="Campaign" htmlFor="campaign">
              <Input id="campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Autumn launch" />
            </Field>
            <Field label="Tags" htmlFor="tags">
              <TagInput id="tags" value={tags} onChange={setTags} placeholder="Add a tag and press Enter" max={20} />
            </Field>
          </div>
        </GlassCard>

        <GlassCard>
          <CardTitle
            description="Validated on upload. Instagram images are converted to JPEG automatically."
            action={
              <Button size="sm" variant="ghost" onClick={() => setTool("image")}>
                <ImagePlus /> Create with AI
              </Button>
            }
          >
            Media
          </CardTitle>
          <MediaPicker selected={media} onChange={setMedia} />
        </GlassCard>
      </div>

      {/* Right: variants, previews, publishing */}
      <div className="space-y-4">
        <GlassCard>
          <CardTitle description="Each platform gets its own editable version.">Platforms</CardTitle>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  aria-pressed={on}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition", on ? "border-moss/50 bg-moss/10 text-white" : "border-white/15 text-fog hover:border-white/30")}
                >
                  <PlatformIcon platform={p} /> {PLATFORM_META[p].label} {on && <Check className="size-3.5 text-moss" />}
                </button>
              );
            })}
          </div>

          {platforms.length > 0 && (
            <Tabs value={active} onValueChange={(v) => setActive(v as Platform)} className="mt-5">
              <TabsList>
                {platforms.map((p) => {
                  const errs = issuesFor(p).filter((i) => i.level === "error").length;
                  return (
                    <TabsTrigger key={p} value={p} className="flex items-center gap-1.5">
                      <PlatformIcon platform={p} className="size-3.5" /> {PLATFORM_META[p].label}
                      {errs > 0 && <span className="size-1.5 rounded-full bg-dawn" aria-label={`${errs} problems`} />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {platforms.map((p) => {
                const v = getVariant(p);
                const locked = lockedPlatforms.has(p);
                const final = finalPostText(p, v.body, v.hashtags, linkUrl || null);
                const len = textLength(p, final);
                const max = platformLimits(p, { xMaxLength }).maxChars;
                const issues = issuesFor(p);
                const account = accounts.find((a) => a.platform === p && selectedAccounts.includes(a.id)) ?? accountsByPlatform(p)[0];
                return (
                  <TabsContent key={p} value={p} className="mt-4 space-y-3">
                    {locked && (
                      <Notice tone="info">
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="size-3.5" /> Already published or publishing on {PLATFORM_META[p].label}. Duplicate the post to make a new version.
                        </span>
                      </Notice>
                    )}
                    <div className="relative">
                      <Textarea aria-label={`${PLATFORM_META[p].label} text`} rows={8} value={v.body} disabled={locked} onChange={(e) => setVariant(p, { body: e.target.value, aiGenerated: v.aiGenerated })} placeholder={`Write the ${PLATFORM_META[p].label} version, or generate it from the main content.`} />
                      <span className={cn("absolute bottom-2 right-3 text-xs tabular-nums", len > max ? "text-dawn" : len > max * 0.9 ? "text-sun" : "text-stone")}>
                        {len}/{max}
                        {p === "x" && " weighted"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-56 flex-1">
                        <TagInput value={v.hashtags} onChange={(h) => setVariant(p, { hashtags: h })} placeholder="Hashtags (without #)" />
                      </div>
                      <Button size="sm" variant="glass" onClick={() => hashtags(p)} loading={busy === "tags"} disabled={!aiAvailable || locked || !!busy}>
                        <Hash /> Suggest
                      </Button>
                      <Select aria-label="Rewrite this version" className="h-8 w-auto text-xs" value="" disabled={!aiAvailable || locked || !!busy} onChange={(e) => e.target.value && runRewrite(e.target.value, p)}>
                        <option value="">Rewrite…</option>
                        <option value="improve">Improve</option>
                        <option value="humanize">Make it sound human</option>
                        <option value="shorten">Shorten</option>
                        <option value="expand">Expand</option>
                        <option value="tone">Apply tone</option>
                        <option value="simplify">Simplify</option>
                        <option value="fix_grammar">Fix grammar</option>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => critique(p)} loading={busy === "critique"} disabled={!aiAvailable || !v.body.trim() || !!busy}>
                        <Gauge /> Check quality
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Copy text" onClick={() => void navigator.clipboard.writeText(final).then(() => toast.success("Copied"))} disabled={!final.trim()}>
                        <ClipboardCopy />
                      </Button>
                    </div>
                    {critiques[p] && <CritiqueCard critique={critiques[p]} onDismiss={() => setCritiques((c) => ({ ...c, [p]: undefined }))} />}
                    <label className="flex items-center gap-2 text-sm text-fog">
                      <Switch checked={v.includeMedia} onCheckedChange={(c) => setVariant(p, { includeMedia: c })} label="Include media" /> Include attached media
                    </label>
                    {p === "x" && /https?:\/\//.test(final + linkUrl) && (
                      <p className="text-xs text-sun">Heads-up: X API pricing charges more for posts that contain a URL.</p>
                    )}
                    {issues.length > 0 && (
                      <ul className="space-y-1">
                        {issues.map((i, idx) => (
                          <li key={idx} className={cn("flex gap-2 text-xs", i.level === "error" ? "text-red-200" : "text-amber-100/90")}>
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {i.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-wider text-stone">Preview</p>
                      <PlatformPreview platform={p} text={final} media={v.includeMedia ? media : []} name={account?.displayName ?? "You"} handle={account?.username} />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </GlassCard>

        {initial.jobs.length > 0 && (
          <GlassCard>
            <CardTitle>Destinations</CardTitle>
            <ul className="space-y-2">
              {initial.jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm">
                  <PlatformBadge platform={j.platform} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-mist">{j.account.displayName}</span>
                  <StatusBadge status={j.status} />
                  {j.publishedUrl && (
                    <a href={j.publishedUrl} target="_blank" rel="noreferrer" className="text-moss" aria-label="Open post">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <Link href={`/history?content=${initial.id}`} className="mt-3 inline-block text-sm text-moss hover:underline">
              Full history →
            </Link>
          </GlassCard>
        )}

        <GlassCard strong>
          <CardTitle description="One job per account, each tracked separately.">Publish</CardTitle>
          {!workerReady && (
            <Notice tone="warn" className="mb-3">
              Publishing runs in the background worker, which needs Redis (<code>REDIS_URL</code>) and <code>pnpm worker</code>. Until then, posts are saved and queued but not sent.
            </Notice>
          )}
          {accounts.length === 0 ? (
            <Notice tone="warn">
              No accounts connected.{" "}
              <Link href="/accounts" className="underline">
                Connect an account
              </Link>{" "}
              to publish. You can still save drafts.
            </Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accounts
                .filter((a) => platforms.includes(a.platform))
                .map((a) => {
                  const on = selectedAccounts.includes(a.id);
                  const usable = a.status === "connected";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!usable || lockedPlatforms.has(a.platform)}
                      title={usable ? undefined : a.lastError ?? a.status}
                      onClick={() => setSelectedAccounts((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                      aria-pressed={on}
                      className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition disabled:opacity-40", on ? "border-moss/50 bg-moss/10 text-white" : "border-white/15 text-fog hover:border-white/30")}
                    >
                      <PlatformIcon platform={a.platform} className="size-3.5" /> {a.displayName}
                      {!usable && <span className="text-[10px] text-sun">({a.status.replace("_", " ")})</span>}
                    </button>
                  );
                })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="inline-flex rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Publishing mode">
              {(["schedule", "now"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("rounded-lg px-3 py-1.5 text-sm", mode === m ? "bg-white/15 text-white" : "text-fog")}>
                  {m === "now" ? "Publish now" : "Schedule"}
                </button>
              ))}
            </div>
            {mode === "schedule" && (
              <>
                <Field label="Date & time" htmlFor="when" className="w-52">
                  <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </Field>
                <Field label="Time zone" htmlFor="ptz" className="w-48">
                  <Select id="ptz" value={tz} onChange={(e) => setTz(e.target.value)}>
                    {[...new Set([timezone, ...COMMON_TIMEZONES])].map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </div>

          {blocking.length > 0 && selectedAccounts.length > 0 && (
            <p className="mt-3 text-xs text-red-200">
              Fix before publishing: {blocking.slice(0, 3).map((b) => `${PLATFORM_META[b.p].label}: ${b.message}`).join(" · ")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="glass" onClick={() => save()} loading={busy === "save"} disabled={!!busy && busy !== "save"}>
              <Save /> Save draft
            </Button>
            <Button onClick={publish} loading={busy === "publish"} disabled={!!busy || !selectedAccounts.length || blocking.some((b) => selectedAccounts.some((id) => accounts.find((a) => a.id === id)?.platform === b.p))}>
              {mode === "now" ? <Send /> : <CalendarClock />} {mode === "now" ? "Publish now" : "Schedule"}
            </Button>
          </div>
        </GlassCard>
      </div>

      <Dialog
        open={tool === "document"}
        onOpenChange={(o) => !o && setTool(null)}
        title="Start from a document"
        description="Upload a certificate, letter, poster or summary. Check the facts, then get a draft for every platform."
        wide="xl"
      >
        <DocumentImport initialId={initialDocumentId} {...documents} />
      </Dialog>
      <Dialog open={tool === "image"} onOpenChange={(o) => !o && setTool(null)} title="Create an image with AI" description="Get an image prompt and alt text from your post, then create the image and attach it." wide>
        <ImageLab
          disabled={!aiAvailable}
          initialText={body}
          onAttach={(m) => {
            setMedia((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
            setTool(null);
            toast.success("Image attached to this post");
          }}
        />
      </Dialog>
      <DiffDialog
        result={rewrite}
        onClose={() => setRewrite(null)}
        onAccept={(text) => {
          if (rewrite?.target === "master") setBody(text);
          else if (rewrite) setVariant(rewrite.target, { body: text, aiGenerated: true });
          setRewrite(null);
        }}
      />
    </div>
  );
}

function CritiqueCard({ critique, onDismiss }: { critique: Critique; onDismiss: () => void }) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <p className="mb-2 flex items-center justify-between text-sm font-medium text-white">
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="size-4 text-moss" /> Editor&apos;s read · {critique.score.toFixed(1)}/10
        </span>
        <button className="text-xs text-stone hover:text-white" onClick={onDismiss}>
          Dismiss
        </button>
      </p>
      {critique.issues.length === 0 ? (
        <p className="text-xs text-fog">No significant issues found.</p>
      ) : (
        <ul className="space-y-1.5">
          {critique.issues.map((i, k) => (
            <li key={k} className="text-xs">
              <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase", i.severity === "high" ? "bg-red-500/20 text-red-200" : i.severity === "medium" ? "bg-amber-400/20 text-amber-100" : "bg-white/10 text-fog")}>{i.severity}</span>
              <span className="text-mist">{i.message}</span>
              {i.quote && <span className="mt-0.5 block italic text-stone">“{i.quote}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
