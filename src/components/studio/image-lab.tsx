"use client";
import { Copy, ImagePlus, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CardTitle, GlassCard, Notice } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api-client";

interface Result {
  prompt: string;
  altText: string;
  aspectRatio: string;
  canGenerate: boolean;
  media?: { id: string; url: string; altText: string | null };
}

const STYLES = ["Natural photography, soft daylight", "Clean 3D illustration", "Minimal flat illustration", "Editorial magazine photo", "Watercolour", "Bold poster graphic"];

/** Image prompter: turns a post into an image prompt + alt text, and can render it with the configured Gemini image model. */
export function ImageLab({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState("");
  const [style, setStyle] = useState(STYLES[0]!);
  const [aspect, setAspect] = useState("1:1");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(generate: boolean) {
    setBusy(generate ? "gen" : "prompt");
    try {
      const r = await api<Result>("/ai/image", { method: "POST", json: generate && res ? { prompt: res.prompt, aspectRatio: aspect, generate: true } : { text, style, aspectRatio: aspect, generate } });
      setRes((prev) => ({ ...(prev ?? r), ...r, altText: r.altText || prev?.altText || "" }));
      if (r.media) toast.success("Image saved to your media library");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard>
        <CardTitle icon={<ImagePlus />} description="Describe the post or paste it. You'll get a ready-to-use image prompt and alt text.">
          Image prompter
        </CardTitle>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. We just opened our second café: same beans, bigger garden seating." aria-label="Post text" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Style" htmlFor="ist">
            <Input id="ist" list="styles" value={style} onChange={(e) => setStyle(e.target.value)} />
            <datalist id="styles">
              {STYLES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Shape" htmlFor="iar">
            <Select id="iar" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              <option value="1:1">Square 1:1 (feeds)</option>
              <option value="4:5">Portrait 4:5 (Instagram)</option>
              <option value="9:16">Tall 9:16 (Stories, Pinterest)</option>
              <option value="16:9">Wide 16:9 (YouTube, LinkedIn)</option>
            </Select>
          </Field>
        </div>
        <Button className="mt-4 w-full" onClick={() => run(false)} loading={busy === "prompt"} disabled={disabled || text.trim().length < 3 || !!busy}>
          <Wand2 /> Write image prompt
        </Button>
      </GlassCard>

      <GlassCard>
        {!res ? (
          <p className="py-16 text-center text-sm text-fog">Your image prompt appears here.</p>
        ) : (
          <div className="space-y-4">
            <Field label="Prompt" htmlFor="ipr">
              <Textarea id="ipr" rows={6} value={res.prompt} onChange={(e) => setRes({ ...res, prompt: e.target.value })} />
            </Field>
            <Field label="Alt text (for accessibility)" htmlFor="ialt">
              <Textarea id="ialt" rows={2} value={res.altText} onChange={(e) => setRes({ ...res, altText: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="glass" onClick={() => void navigator.clipboard.writeText(res.prompt).then(() => toast.success("Prompt copied"))}>
                <Copy /> Copy prompt
              </Button>
              <Button onClick={() => run(true)} loading={busy === "gen"} disabled={!res.canGenerate || !!busy}>
                <ImagePlus /> Generate image
              </Button>
            </div>
            {!res.canGenerate && <Notice tone="info">Image generation needs GEMINI_API_KEY on the server. You can still copy the prompt into any image tool.</Notice>}
            {res.media && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={res.media.url} alt={res.media.altText ?? res.altText} className="w-full rounded-xl" />
                <figcaption className="mt-2 text-xs text-stone">Saved to your media library. Attach it to any post in the composer. AI-generated: check it before publishing.</figcaption>
              </figure>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
