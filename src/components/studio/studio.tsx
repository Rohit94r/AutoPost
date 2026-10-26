"use client";
import { ArrowRight, ClipboardCopy, Gauge, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { CardTitle, EmptyState, GlassCard, Notice } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { PlatformBadge, PlatformIcon } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { wordDiff } from "@/lib/diff";
import { composeFinalText, PLATFORM_META, PLATFORMS, type Platform, type ValidationIssue } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { LENGTHS, REWRITE_LABEL, REWRITE_OPS, TONES, TONE_LABEL } from "@/lib/writing";

interface Variant {
  platform: Platform;
  text: string;
  hashtags: string[];
  issues: ValidationIssue[];
}

export function Studio({ brands, aiAvailable }: { brands: { id: string; name: string; isDefault: boolean }[]; aiAvailable: boolean }) {
  return (
    <Tabs defaultValue="generate">
      <TabsList className="mb-4">
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="rewrite">Rewrite lab</TabsTrigger>
      </TabsList>
      {!aiAvailable && <Notice tone="warn" className="mb-4" title="AI is not configured">Add GROQ_API_KEY and/or GEMINI_API_KEY on the server to use the studio.</Notice>}
      <TabsContent value="generate">
        <Generate brands={brands} disabled={!aiAvailable} />
      </TabsContent>
      <TabsContent value="rewrite">
        <RewriteLab brands={brands} disabled={!aiAvailable} />
      </TabsContent>
    </Tabs>
  );
}

function Generate({ brands, disabled }: { brands: { id: string; name: string; isDefault: boolean }[]; disabled: boolean }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("medium");
  const [audience, setAudience] = useState("");
  const [brandId, setBrandId] = useState(brands.find((b) => b.isDefault)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ variants: Variant[]; notes: string | null; provider: string; model: string } | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(
        await api("/ai/generate", {
          method: "POST",
          json: { idea, platforms, brandProfileId: brandId || null, controls: { ...(tone ? { tone } : {}), length, ...(audience ? { audience } : {}) } },
        }),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openInComposer() {
    if (!result) return;
    try {
      const r = await api<{ content: { id: string } }>("/content", {
        method: "POST",
        json: {
          title: idea.slice(0, 60),
          body: idea,
          aiGenerated: true,
          brandProfileId: brandId || null,
          variants: result.variants.map((v) => ({ platform: v.platform, body: v.text, hashtags: v.hashtags, includeMedia: true, aiGenerated: true })),
        },
      });
      router.push(`/compose?id=${r.content.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <GlassCard>
        <CardTitle icon={<Sparkles />} description="Facts come only from what you write here.">
          Your idea
        </CardTitle>
        <Textarea rows={8} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What happened, why it matters, any specifics (names, numbers, dates) you want included." aria-label="Idea" />
        <div className="mt-4 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platforms.includes(p)}
              onClick={() => setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
              className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm", platforms.includes(p) ? "border-moss/50 bg-moss/10 text-white" : "border-white/15 text-fog")}
            >
              <PlatformIcon platform={p} className="size-3.5" /> {PLATFORM_META[p].label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Brand voice" htmlFor="sb">
            <Select id="sb" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tone" htmlFor="st">
            <Select id="st" value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="">Auto (brand)</option>
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Length" htmlFor="sl">
            <Select id="sl" value={length} onChange={(e) => setLength(e.target.value)}>
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Audience" htmlFor="sa">
            <input id="sa" className="glass-input h-10 w-full px-3 text-sm text-white outline-none" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <Button className="mt-5 w-full" size="lg" onClick={run} loading={busy} disabled={disabled || idea.trim().length < 3 || !platforms.length}>
          <Sparkles /> Generate
        </Button>
      </GlassCard>

      <div className="space-y-3">
        {!result ? (
          <GlassCard>
            <EmptyState icon={<Wand2 />} title="Variants appear here" description="Each platform gets its own version: different length, structure and tone, same facts." />
          </GlassCard>
        ) : (
          <>
            <p className="text-xs text-fog">
              {result.provider === "groq" ? "Groq" : "Gemini"} · {result.model}
              {result.notes ? ` · ${result.notes}` : ""}
            </p>
            {result.variants.map((v) => (
              <GlassCard key={v.platform} className="animate-rise">
                <div className="mb-3 flex items-center justify-between">
                  <PlatformBadge platform={v.platform} withLabel />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(composeFinalText(v.text, v.hashtags));
                      toast.success("Copied");
                    }}
                  >
                    <ClipboardCopy /> Copy
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-mist">{composeFinalText(v.text, v.hashtags)}</p>
                {v.issues.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-amber-100/90">
                    {v.issues.map((i, k) => (
                      <li key={k}>⚠ {i.message}</li>
                    ))}
                  </ul>
                )}
              </GlassCard>
            ))}
            <Button onClick={openInComposer} className="w-full">
              Edit &amp; publish in composer <ArrowRight />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RewriteLab({ brands, disabled }: { brands: { id: string; name: string; isDefault: boolean }[]; disabled: boolean }) {
  const [text, setText] = useState("");
  const [op, setOp] = useState<(typeof REWRITE_OPS)[number]>("improve");
  const [tone, setTone] = useState("professional");
  const [platform, setPlatform] = useState<Platform | "">("linkedin");
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ before: string; after: string; changes: string[]; issues: ValidationIssue[] } | null>(null);
  const [critique, setCritique] = useState<{ score: number; issues: { severity: string; message: string; quote?: string }[] } | null>(null);
  const brandId = brands.find((b) => b.isDefault)?.id ?? null;

  async function rewrite() {
    setBusy("rw");
    try {
      setRes(await api("/ai/rewrite", { method: "POST", json: { text, operation: op, platform: platform || undefined, brandProfileId: brandId, controls: op === "tone" ? { tone } : {} } }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function runCritique() {
    setBusy("cr");
    try {
      setCritique(await api("/ai/critique", { method: "POST", json: { text, platform: platform || "linkedin" } }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a post to improve, shorten, expand or re-tone." aria-label="Text to rewrite" />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Operation" htmlFor="op" className="w-44">
            <Select id="op" value={op} onChange={(e) => setOp(e.target.value as typeof op)}>
              {REWRITE_OPS.map((o) => (
                <option key={o} value={o}>
                  {REWRITE_LABEL[o]}
                </option>
              ))}
            </Select>
          </Field>
          {op === "tone" && (
            <Field label="Tone" htmlFor="rt" className="w-40">
              <Select id="rt" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Platform" htmlFor="rp" className="w-40">
            <Select id="rp" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")}>
              <option value="">Any</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={rewrite} loading={busy === "rw"} disabled={disabled || !text.trim() || !!busy}>
            <Wand2 /> Rewrite
          </Button>
          <Button variant="glass" onClick={runCritique} loading={busy === "cr"} disabled={disabled || !text.trim() || !!busy}>
            <Gauge /> Critique
          </Button>
        </div>
      </GlassCard>

      {res && (
        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard>
            <CardTitle>Before</CardTitle>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fog">{res.before}</p>
          </GlassCard>
          <GlassCard>
            <CardTitle
              action={
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(res.after).then(() => toast.success("Copied"))}>
                  <ClipboardCopy /> Copy
                </Button>
              }
            >
              After
            </CardTitle>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {wordDiff(res.before, res.after).map((p, i) =>
                p.type === "removed" ? null : (
                  <span key={i} className={p.type === "added" ? "rounded bg-emerald-400/20 text-emerald-100" : "text-mist"}>
                    {p.text}
                  </span>
                ),
              )}
            </p>
            {res.changes.length > 0 && <ul className="mt-3 list-inside list-disc text-xs text-fog">{res.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
            {res.issues.length > 0 && <Notice tone="warn" className="mt-3">{res.issues.map((i) => i.message).join(" ")}</Notice>}
          </GlassCard>
        </div>
      )}

      {critique && (
        <GlassCard>
          <CardTitle icon={<Gauge />} description="An editor's read. Use it as guidance, not a verdict.">
            Critique · {critique.score.toFixed(1)}/10
          </CardTitle>
          {critique.issues.length === 0 ? (
            <p className="text-sm text-fog">No significant issues found.</p>
          ) : (
            <ul className="space-y-2">
              {critique.issues.map((i, k) => (
                <li key={k} className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                  <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase", i.severity === "high" ? "bg-red-500/20 text-red-200" : i.severity === "medium" ? "bg-amber-400/20 text-amber-100" : "bg-white/10 text-fog")}>{i.severity}</span>
                  <span className="text-mist">{i.message}</span>
                  {i.quote && <span className="mt-1 block text-xs italic text-stone">“{i.quote}”</span>}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      )}
    </div>
  );
}
