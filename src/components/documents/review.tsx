"use client";
import { ArrowRight, CheckCircle2, ChevronDown, Plus, RefreshCcw, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CardTitle, GlassCard, Notice, Spinner } from "@/components/ui/misc";
import { PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export interface Fact {
  key: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  evidence?: string | null;
  page?: number | null;
  source: "document" | "user";
}

interface Props {
  doc: {
    id: string;
    originalFilename: string;
    mimeType: string;
    status: string;
    error: string | null;
    previewUrl: string | null;
    aiProvider: string | null;
    extraction: {
      documentType: string;
      method: string;
      summary: string | null;
      extractedText: string;
      fields: Fact[];
      missingFields: string[];
      warnings: string[];
      reviewedFields: Fact[] | null;
      userClaims: string | null;
      model: string | null;
    } | null;
  };
}

const CONF = { high: ["bg-moss", "Clearly printed"], medium: ["bg-sun", "Partly legible, please check"], low: ["bg-dawn", "Uncertain, please verify"] } as const;

export function DocumentReview({ doc }: Props) {
  const router = useRouter();
  const ex = doc.extraction;
  const [facts, setFacts] = useState<Fact[]>(ex?.reviewedFields ?? ex?.fields ?? []);
  const [claims, setClaims] = useState(ex?.userClaims ?? "");
  const [reviewed, setReviewed] = useState(Boolean(ex?.reviewedFields));
  const [busy, setBusy] = useState<string | null>(null);
  const [directions, setDirections] = useState<{ id: string; title: string; angle: string; sample: string }[] | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (doc.status !== "processing" && doc.status !== "uploaded") return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [doc.status, router]);

  const update = (i: number, patch: Partial<Fact>) => {
    setReviewed(false);
    setFacts((f) => f.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  };

  async function saveReview() {
    setBusy("review");
    try {
      const r = await api<{ fields: Fact[] }>(`/documents/${doc.id}/review`, { method: "PUT", json: { fields: facts, userClaims: claims || null } });
      setFacts(r.fields);
      setReviewed(true);
      toast.success("Facts confirmed");
      const d = await api<{ directions: typeof directions }>(`/documents/${doc.id}/directions`, { method: "POST", json: {} });
      setDirections(d.directions);
      setDirection(d.directions?.[0]?.id ?? null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!direction) return;
    setBusy("generate");
    try {
      const r = await api<{ contentId: string }>(`/documents/${doc.id}/generate`, { method: "POST", json: { direction, platforms } });
      toast.success("Drafts created. Review them in the composer.");
      router.push(`/compose?id=${r.contentId}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function retry() {
    setBusy("retry");
    try {
      await api(`/documents/${doc.id}/extract`, { method: "POST" });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this document and its extracted facts?")) return;
    await api(`/documents/${doc.id}`, { method: "DELETE" });
    router.push("/documents");
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="space-y-4">
        <GlassCard>
          <CardTitle action={<StatusBadge status={doc.status} />}>Original</CardTitle>
          {doc.previewUrl ? (
            doc.mimeType === "application/pdf" ? (
              <iframe src={doc.previewUrl} title="Document preview" className="h-[520px] w-full rounded-xl bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.previewUrl} alt={`Preview of ${doc.originalFilename}`} className="max-h-[520px] w-full rounded-xl object-contain" />
            )
          ) : (
            <p className="text-sm text-fog">The original file was deleted under your retention policy. Extracted facts are kept.</p>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={remove}>
              <Trash2 /> Delete document
            </Button>
          </div>
        </GlassCard>
        {ex?.extractedText && (
          <GlassCard>
            <button className="flex w-full items-center justify-between text-left" onClick={() => setShowText((s) => !s)} aria-expanded={showText}>
              <span className="text-sm font-semibold text-white">Extracted text</span>
              <ChevronDown className={cn("size-4 text-fog transition", showText && "rotate-180")} />
            </button>
            {showText && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-sans text-xs leading-relaxed text-fog">{ex.extractedText}</pre>}
          </GlassCard>
        )}
      </div>

      <div className="space-y-4">
        {(doc.status === "processing" || doc.status === "uploaded") && (
          <GlassCard className="flex items-center gap-3">
            <Spinner className="size-5 text-moss" />
            <div>
              <p className="text-sm text-white">Reading your document…</p>
              <p className="text-xs text-fog">Text extraction first; scanned pages and images go through Gemini vision. This page updates automatically.</p>
            </div>
          </GlassCard>
        )}
        {doc.status === "failed" && (
          <Notice tone="error" title="Extraction failed">
            {doc.error}
            <div className="mt-2">
              <Button size="sm" variant="glass" onClick={retry} loading={busy === "retry"}>
                <RefreshCcw /> Try again
              </Button>
            </div>
          </Notice>
        )}

        {ex && (
          <GlassCard>
            <CardTitle description={`${ex.documentType.replace(/_/g, " ")} · ${ex.method.replace(/_/g, " ")}${ex.model ? ` · ${ex.model}` : ""}`}>Check the facts</CardTitle>
            {ex.summary && <p className="mb-4 text-sm text-fog">{ex.summary}</p>}
            {ex.warnings.length > 0 && (
              <Notice tone="warn" className="mb-4">
                <ul className="list-inside list-disc">{ex.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </Notice>
            )}
            <ul className="space-y-3">
              {facts.map((f, i) => (
                <li key={`${f.key}-${i}`} className="rounded-xl bg-black/20 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", f.source === "user" ? "bg-sky-300" : CONF[f.confidence][0])} title={f.source === "user" ? "Added or edited by you" : CONF[f.confidence][1]} />
                    <Input aria-label="Field label" value={f.label} onChange={(e) => update(i, { label: e.target.value })} className="h-7 flex-1 border-transparent bg-transparent px-1 text-xs font-medium text-fog focus:bg-black/20" />
                    <span className="text-[10px] uppercase tracking-wider text-stone">{f.source === "user" ? "you" : `${f.confidence}${f.page ? ` · p.${f.page}` : ""}`}</span>
                    <button className="text-stone hover:text-dawn" aria-label={`Remove ${f.label}`} onClick={() => setFacts((x) => x.filter((_, k) => k !== i))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Input aria-label={f.label} value={f.value} onChange={(e) => update(i, { value: e.target.value })} />
                  {f.evidence && f.source === "document" && <p className="mt-1.5 text-xs italic text-stone">“{f.evidence}”</p>}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              className="mt-3"
              onClick={() => {
                setReviewed(false);
                setFacts((x) => [...x, { key: `custom_${x.length + 1}`, label: "New fact", value: "", confidence: "high", source: "user" }]);
              }}
            >
              <Plus /> Add a fact
            </Button>
            {ex.missingFields.length > 0 && (
              <p className="mt-3 text-xs text-stone">
                Not found in the document: {ex.missingFields.map((m) => m.replace(/_/g, " ")).join(", ")}. Add them only if they&apos;re true.
              </p>
            )}
            <Field label="Anything else to mention? (your own claims, kept separate from document facts)" htmlFor="claims" className="mt-4">
              <Textarea id="claims" rows={3} value={claims} onChange={(e) => {
                setClaims(e.target.value);
                setReviewed(false);
              }} placeholder="e.g. This was my first data project; thanks to my mentor Priya." />
            </Field>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-stone">Reading a document doesn&apos;t verify that it&apos;s authentic.</p>
              <Button onClick={saveReview} loading={busy === "review"} disabled={!facts.length || facts.some((f) => !f.label.trim())}>
                {reviewed ? <CheckCircle2 /> : <Sparkles />} {reviewed ? "Confirmed. Suggest directions" : "Confirm facts"}
              </Button>
            </div>
          </GlassCard>
        )}

        {directions && (
          <GlassCard className="animate-rise">
            <CardTitle icon={<Sparkles />} description="Pick a style. Every draft uses only the facts you confirmed.">
              Content directions
            </CardTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {directions.map((d) => (
                <button key={d.id} onClick={() => setDirection(d.id)} aria-pressed={direction === d.id} className={cn("rounded-xl border p-3 text-left transition", direction === d.id ? "border-moss/60 bg-moss/10" : "border-white/12 hover:border-white/25")}>
                  <p className="text-sm font-medium text-white">{d.title}</p>
                  <p className="mt-0.5 text-xs text-fog">{d.angle}</p>
                  <p className="mt-2 line-clamp-3 text-xs italic text-stone">{d.sample}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} aria-pressed={platforms.includes(p)} onClick={() => setPlatforms((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))} className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm", platforms.includes(p) ? "border-moss/50 bg-moss/10 text-white" : "border-white/15 text-fog")}>
                  <PlatformIcon platform={p} className="size-3.5" /> {PLATFORM_META[p].label}
                </button>
              ))}
              <div className="flex-1" />
              <Button onClick={generate} loading={busy === "generate"} disabled={!direction || !platforms.length}>
                Create drafts <ArrowRight />
              </Button>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
