"use client";
import { Copy, ImagePlus, Paperclip, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api-client";
import type { MediaItem } from "./types";

interface Result {
  prompt: string;
  altText: string;
  aspectRatio: string;
  canGenerate: boolean;
  media?: MediaItem;
}

const STYLES = ["Natural photography, soft daylight", "Clean 3D illustration", "Minimal flat illustration", "Editorial magazine photo", "Watercolour", "Bold poster graphic"];

/**
 * Image prompter: turns the post into an image prompt + alt text, and can render it with the
 * configured Gemini image model. Generated images are saved to media and can be attached to the post.
 */
export function ImageLab({ disabled, initialText, onAttach }: { disabled: boolean; initialText: string; onAttach: (m: MediaItem) => void }) {
  const [text, setText] = useState(initialText);
  const [style, setStyle] = useState(STYLES[0]!);
  const [aspect, setAspect] = useState("1:1");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(generate: boolean) {
    setBusy(generate ? "gen" : "prompt");
    try {
      const r = await api<Result>("/ai/image", { method: "POST", json: generate && res ? { prompt: res.prompt, aspectRatio: aspect, generate: true } : { text, style, aspectRatio: aspect, generate } });
      setRes((prev) => ({ ...(prev ?? r), ...r, altText: r.altText || prev?.altText || "" }));
      if (r.media) toast.success("Image created");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {disabled && <Notice tone="warn">AI isn&apos;t configured on this server. Add GEMINI_API_KEY to create images.</Notice>}
      <Field label="What should the image show?" htmlFor="itx" hint="Starts from your post. Edit it freely.">
        <Textarea id="itx" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. We just opened our second café: same beans, bigger garden seating." />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
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
      <Button className="w-full" onClick={() => run(false)} loading={busy === "prompt"} disabled={disabled || text.trim().length < 3 || !!busy}>
        <Wand2 /> Write image prompt
      </Button>

      {res && (
        <div className="space-y-4 border-t border-white/10 pt-4">
          <Field label="Prompt" htmlFor="ipr">
            <Textarea id="ipr" rows={5} value={res.prompt} onChange={(e) => setRes({ ...res, prompt: e.target.value })} />
          </Field>
          <Field label="Alt text (for accessibility)" htmlFor="ialt">
            <Textarea id="ialt" rows={2} value={res.altText} onChange={(e) => setRes({ ...res, altText: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="glass" onClick={() => void navigator.clipboard.writeText(res.prompt).then(() => toast.success("Prompt copied"))}>
              <Copy /> Copy prompt
            </Button>
            <Button onClick={() => run(true)} loading={busy === "gen"} disabled={!res.canGenerate || !!busy}>
              <ImagePlus /> {res.media ? "Create another" : "Create image"}
            </Button>
          </div>
          {!res.canGenerate && <Notice tone="info">Image generation needs GEMINI_API_KEY on the server. You can still copy the prompt into any image tool.</Notice>}
          {res.media && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={res.media.url} alt={res.media.altText ?? res.altText} className="w-full rounded-xl" />
              <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone">
                AI-generated: check it before publishing.
                <Button size="sm" onClick={() => onAttach(res.media!)}>
                  <Paperclip /> Attach to post
                </Button>
              </figcaption>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}
