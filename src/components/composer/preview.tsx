"use client";
import { Bookmark, Heart, MessageCircle, Repeat2, Send, Share, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { PlatformIcon } from "@/components/ui/platform";
import type { Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import type { MediaItem } from "./types";

/** Approximate visual previews. Platforms render differently; these are guides, not pixel-perfect replicas. */
export function PlatformPreview({ platform, text, media, name, handle }: { platform: Platform; text: string; media: MediaItem[]; name: string; handle?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const fold = platform === "linkedin" ? 210 : platform === "instagram" ? 125 : Infinity;
  const shown = expanded || text.length <= fold ? text : `${text.slice(0, fold).trimEnd()}…`;
  const first = media[0];

  const body = (
    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-mist">
      {renderTags(shown)}
      {text.length > fold && !expanded && (
        <button type="button" className="ml-1 text-stone hover:underline" onClick={() => setExpanded(true)}>
          {platform === "instagram" ? "more" : "…see more"}
        </button>
      )}
    </p>
  );

  const mediaEl = first ? (
    <div className={cn("overflow-hidden bg-black/40", platform === "instagram" ? "aspect-[4/5]" : "rounded-xl", platform === "x" && "mt-2 border border-white/10")}>
      {first.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.url} alt={first.altText ?? ""} className="size-full max-h-96 w-full object-cover" />
      ) : (
        <video src={first.url} className="max-h-96 w-full" controls muted />
      )}
    </div>
  ) : platform === "instagram" ? (
    <div className="grid aspect-[4/5] place-items-center bg-black/30 text-xs text-stone">Instagram needs an image or video</div>
  ) : null;

  const avatar = (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-sun/70 to-moss-strong/70 text-xs font-bold text-ink">{name.slice(0, 1).toUpperCase()}</span>
  );

  if (platform === "instagram") {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {avatar}
          <span className="text-sm font-semibold text-white">{handle ?? name}</span>
          <PlatformIcon platform="instagram" className="ml-auto text-fog" />
        </div>
        {mediaEl}
        <div className="flex gap-4 px-3 pt-3 text-white">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <div className="px-3 pb-3 pt-2">
          <span className="mr-1.5 text-sm font-semibold text-white">{handle ?? name}</span>
          {body}
        </div>
      </div>
    );
  }
  if (platform === "x") {
    return (
      <div className="flex gap-3 rounded-2xl border border-white/10 bg-black/40 p-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-white">{name}</span> <span className="text-stone">@{handle ?? "you"} · now</span>
          </p>
          {body}
          {mediaEl}
          <div className="mt-3 flex justify-between pr-6 text-stone">
            <MessageCircle className="size-4" />
            <Repeat2 className="size-4" />
            <Heart className="size-4" />
            <Share className="size-4" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40">
      <div className="flex items-center gap-2.5 p-4 pb-2">
        {avatar}
        <div>
          <p className="text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-stone">Now · 🌐</p>
        </div>
      </div>
      <div className="px-4 pb-3">{body}</div>
      {mediaEl && <div className="px-0">{mediaEl}</div>}
      <div className="flex justify-around border-t border-white/8 py-2 text-xs text-fog">
        <span className="inline-flex items-center gap-1.5">
          <ThumbsUp className="size-4" /> Like
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-4" /> Comment
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 className="size-4" /> Repost
        </span>
      </div>
    </div>
  );
}

function renderTags(text: string) {
  return text.split(/(#[\p{L}\p{N}_]+|https?:\/\/\S+)/gu).map((part, i) =>
    /^(#|https?:)/.test(part) ? (
      <span key={i} className="text-sky-300">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
