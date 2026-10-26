"use client";
import { Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, TagInput, Textarea } from "@/components/ui/field";
import { CardTitle, GlassCard, Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EMOJI, FORMALITY, HASHTAG_PREF, TONES, TONE_LABEL } from "@/lib/writing";

export interface Brand {
  id: string;
  name: string;
  description: string | null;
  audience: string | null;
  industry: string | null;
  tone: string;
  writingStyle: string | null;
  language: string;
  perspective: string;
  formality: string;
  vocabulary: string[];
  avoidPhrases: string[];
  preferredCtas: string[];
  hashtagPreference: string;
  emojiPreference: string;
  examplePosts: string[];
  derivedStyle: { summary: string; sentenceLength: string; traits: string[]; signaturePhrases: string[]; avoid: string[]; derivedAt: string } | null;
  isDefault: boolean;
}

const blank = (): Omit<Brand, "id"> => ({
  name: "New profile",
  description: "",
  audience: "",
  industry: "",
  tone: "conversational",
  writingStyle: "",
  language: "English",
  perspective: "first_person",
  formality: "neutral",
  vocabulary: [],
  avoidPhrases: [],
  preferredCtas: [],
  hashtagPreference: "minimal",
  emojiPreference: "minimal",
  examplePosts: [],
  derivedStyle: null,
  isDefault: false,
});

export function BrandEditor({ brands, aiAvailable }: { brands: Brand[]; aiAvailable: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | "new">(brands.find((b) => b.isDefault)?.id ?? brands[0]?.id ?? "new");
  const current = brands.find((b) => b.id === selectedId);
  const [form, setForm] = useState<Omit<Brand, "id">>(current ?? blank());
  const [busy, setBusy] = useState<string | null>(null);
  const [newSample, setNewSample] = useState("");
  const [about, setAbout] = useState("");
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setForm((f) => ({ ...f, [k]: v }));

  const select = (id: string | "new") => {
    setSelectedId(id);
    setForm(id === "new" ? blank() : (brands.find((b) => b.id === id) ?? blank()));
  };

  const body = () => {
    const { derivedStyle: _d, ...rest } = form;
    return { ...rest, description: rest.description || null, audience: rest.audience || null, industry: rest.industry || null, writingStyle: rest.writingStyle || null };
  };

  async function save() {
    setBusy("save");
    try {
      if (selectedId === "new") {
        const r = await api<{ profile: Brand }>("/brand-profiles", { method: "POST", json: body() });
        setSelectedId(r.profile.id);
      } else await api(`/brand-profiles/${selectedId}`, { method: "PATCH", json: body() });
      toast.success("Brand voice saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function autofill() {
    setBusy("autofill");
    try {
      const r = await api<{ profile: Partial<Brand> }>("/ai/brand-autofill", { method: "POST", json: { description: about } });
      setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(r.profile).filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length))) }));
      toast.success("Filled in. Review the fields, then save.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function derive() {
    setBusy("derive");
    try {
      await api(`/brand-profiles/${selectedId}`, { method: "PATCH", json: body() });
      const r = await api<{ profile: Brand }>(`/brand-profiles/${selectedId}/derive`, { method: "POST" });
      setForm((f) => ({ ...f, derivedStyle: r.profile.derivedStyle }));
      toast.success("Writing style derived from your samples");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (selectedId === "new" || !confirm("Delete this brand profile?")) return;
    try {
      await api(`/brand-profiles/${selectedId}`, { method: "DELETE" });
      router.refresh();
      select(brands.find((b) => b.id !== selectedId)?.id ?? "new");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <GlassCard className="h-fit p-3">
        <ul className="space-y-1">
          {brands.map((b) => (
            <li key={b.id}>
              <button onClick={() => select(b.id)} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm", selectedId === b.id ? "bg-white/12 text-white" : "text-fog hover:bg-white/6")}>
                <span className="flex-1 truncate">{b.name}</span>
                {b.isDefault && <Star className="size-3.5 fill-sun text-sun" aria-label="Default" />}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => select("new")}>
          <Plus /> New profile
        </Button>
      </GlassCard>

      <div className="space-y-4">
        <GlassCard>
          <CardTitle icon={<Sparkles />} description="Describe yourself or your brand in plain words. AI fills in the profile; you review it before saving.">
            Fill with AI
          </CardTitle>
          <Textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="I run a small vegan bakery in Pune. Friendly, a bit playful, we post about new bakes and workshops for local families." aria-label="Describe your brand" />
          <Button className="mt-3" variant="glass" onClick={autofill} loading={busy === "autofill"} disabled={!aiAvailable || about.trim().length < 10}>
            <Sparkles /> Fill the profile
          </Button>
        </GlassCard>
        <GlassCard>
          <CardTitle
            action={
              <label className="flex items-center gap-2 text-sm text-fog">
                <Switch checked={form.isDefault} onCheckedChange={(v) => set("isDefault", v)} label="Default profile" /> Default
              </label>
            }
          >
            Identity
          </CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand or creator name" htmlFor="bn">
              <Input id="bn" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Industry" htmlFor="bi">
              <Input id="bi" value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} placeholder="EdTech, student community…" />
            </Field>
            <Field label="Description" htmlFor="bd" className="sm:col-span-2" hint="Real context only. The AI uses this, it doesn't embellish it.">
              <Textarea id="bd" rows={3} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Target audience" htmlFor="ba">
              <Input id="ba" value={form.audience ?? ""} onChange={(e) => set("audience", e.target.value)} />
            </Field>
            <Field label="Language" htmlFor="bl">
              <Input id="bl" value={form.language} onChange={(e) => set("language", e.target.value)} />
            </Field>
          </div>
        </GlassCard>

        <GlassCard>
          <CardTitle>Style</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tone" htmlFor="bt">
              <Select id="bt" value={form.tone} onChange={(e) => set("tone", e.target.value)}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Perspective" htmlFor="bp">
              <Select id="bp" value={form.perspective} onChange={(e) => set("perspective", e.target.value)}>
                <option value="first_person">First person (I)</option>
                <option value="brand_we">Brand / team (we)</option>
                <option value="third_person">Third person</option>
              </Select>
            </Field>
            <Field label="Formality" htmlFor="bf">
              <Select id="bf" value={form.formality} onChange={(e) => set("formality", e.target.value)}>
                {FORMALITY.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Emoji" htmlFor="be">
              <Select id="be" value={form.emojiPreference} onChange={(e) => set("emojiPreference", e.target.value)}>
                {EMOJI.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hashtags" htmlFor="bh">
              <Select id="bh" value={form.hashtagPreference} onChange={(e) => set("hashtagPreference", e.target.value)}>
                {HASHTAG_PREF.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <div />
            <Field label="Writing style notes" htmlFor="bs" className="sm:col-span-3">
              <Textarea id="bs" rows={2} value={form.writingStyle ?? ""} onChange={(e) => set("writingStyle", e.target.value)} placeholder="Short paragraphs. Lead with the result. Explain the 'why' in one line." />
            </Field>
            <Field label="Vocabulary to use" htmlFor="bv" className="sm:col-span-3">
              <TagInput id="bv" value={form.vocabulary} onChange={(v) => set("vocabulary", v)} placeholder="e.g. builders, ship, cohort" />
            </Field>
            <Field label="Words & phrases to avoid" htmlFor="bav" className="sm:col-span-3">
              <TagInput id="bav" value={form.avoidPhrases} onChange={(v) => set("avoidPhrases", v)} placeholder="e.g. synergy, thrilled" />
            </Field>
            <Field label="Preferred calls to action" htmlFor="bc" className="sm:col-span-3">
              <TagInput id="bc" value={form.preferredCtas} onChange={(v) => set("preferredCtas", v)} placeholder="e.g. Read the write-up" max={10} />
            </Field>
          </div>
        </GlassCard>

        <GlassCard>
          <CardTitle description="Paste posts you wrote yourself. We analyse the style; we don't copy sentences.">Example posts</CardTitle>
          <ul className="space-y-2">
            {form.examplePosts.map((p, i) => (
              <li key={i} className="flex gap-2 rounded-xl bg-black/20 p-3 text-sm text-mist">
                <p className="line-clamp-3 flex-1 whitespace-pre-wrap">{p}</p>
                <button aria-label="Remove example" className="text-stone hover:text-dawn" onClick={() => set("examplePosts", form.examplePosts.filter((_, k) => k !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Textarea className="mt-3" rows={3} value={newSample} onChange={(e) => setNewSample(e.target.value)} placeholder="Paste one of your posts…" aria-label="New example post" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="glass"
              disabled={!newSample.trim() || form.examplePosts.length >= 10}
              onClick={() => {
                set("examplePosts", [...form.examplePosts, newSample.trim()]);
                setNewSample("");
              }}
            >
              <Plus /> Add example
            </Button>
            <Button size="sm" onClick={derive} loading={busy === "derive"} disabled={!aiAvailable || selectedId === "new" || form.examplePosts.length < 2}>
              <Sparkles /> Derive my style
            </Button>
          </div>
          {form.derivedStyle && (
            <Notice tone="success" className="mt-4" title="Derived style">
              <p>{form.derivedStyle.summary}</p>
              <p className="mt-1 text-xs">Sentence length: {form.derivedStyle.sentenceLength}</p>
              {form.derivedStyle.traits.length > 0 && <p className="mt-1 text-xs">Traits: {form.derivedStyle.traits.join(" · ")}</p>}
            </Notice>
          )}
        </GlassCard>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={remove} disabled={selectedId === "new" || brands.length <= 1}>
            <Trash2 /> Delete profile
          </Button>
          <Button onClick={save} loading={busy === "save"} disabled={!form.name.trim()}>
            Save brand voice
          </Button>
        </div>
      </div>
    </div>
  );
}
