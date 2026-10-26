"use client";
import { Film, ImagePlus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api-client";
import { cn, formatBytes } from "@/lib/utils";
import type { MediaItem } from "./types";

export function MediaPicker({ selected, onChange }: { selected: MediaItem[]; onChange: (m: MediaItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [library, setLibrary] = useState<MediaItem[] | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(files: FileList | File[]) {
    setUploading(true);
    const added: MediaItem[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await api<{ media: MediaItem }>("/media", { method: "POST", body: fd });
        added.push(r.media);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setUploading(false);
    if (added.length) onChange([...selected, ...added]);
  }

  async function openLibrary() {
    setLibOpen(true);
    try {
      setLibrary((await api<{ media: MediaItem[] }>("/media")).media);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={cn("rounded-xl border border-dashed border-white/20 p-4 transition", drag && "border-moss bg-moss/5")}
      >
        {selected.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {selected.map((m) => (
              <li key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-black/30">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumbnailUrl ?? m.url} alt={m.altText ?? m.originalFilename} className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-fog">
                    <Film className="size-6" />
                  </div>
                )}
                <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== m.id))} className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${m.originalFilename}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="glass" onClick={() => input.current?.click()} loading={uploading}>
            <Upload /> Upload
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={openLibrary}>
            <ImagePlus /> From library
          </Button>
          <span className="text-xs text-stone">JPEG, PNG, WebP, GIF, MP4 or MOV. Drag and drop works too.</span>
        </div>
        <input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>

      <Dialog open={libOpen} onOpenChange={setLibOpen} title="Media library" description="Reuse something you've uploaded before." wide>
        {!library ? (
          <p className="py-8 text-center text-sm text-fog">Loading…</p>
        ) : library.length === 0 ? (
          <p className="py-8 text-center text-sm text-fog">No media yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {library.map((m) => {
              const isSel = selected.some((s) => s.id === m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onChange(isSel ? selected.filter((s) => s.id !== m.id) : [...selected, m])}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-lg bg-black/30 ring-2 transition", isSel ? "ring-moss" : "ring-transparent hover:ring-white/30")}
                    aria-pressed={isSel}
                  >
                    {m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.thumbnailUrl ?? m.url} alt={m.altText ?? m.originalFilename} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-fog">
                        <Film className="size-6" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-fog">{formatBytes(m.sizeBytes)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </div>
  );
}
