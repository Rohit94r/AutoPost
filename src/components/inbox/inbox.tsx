"use client";
import { AtSign, Bot, Check, ExternalLink, EyeOff, MessageCircle, RefreshCcw, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { EmptyState, GlassCard, Spinner } from "@/components/ui/misc";
import { PlatformBadge, PlatformIcon, StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { PLATFORM_META, platformLimits, textLength, type Platform } from "@/lib/platforms";
import { cn, timeAgo } from "@/lib/utils";

interface Item {
  id: string;
  platform: Platform;
  kind: "comment" | "reply" | "mention";
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  text: string;
  permalink: string | null;
  status: string;
  sentiment: string | null;
  draftReply: string | null;
  replyText: string | null;
  repliedBy: string | null;
  autopilotNote: string | null;
  occurredAt: string;
  account: { id: string; displayName: string; username: string | null };
  post: { id: string; text: string | null; url: string | null; thumbnailUrl: string | null } | null;
}

const SENTIMENT: Record<string, string> = {
  positive: "text-emerald-200",
  question: "text-sky-200",
  neutral: "text-fog",
  negative: "text-amber-200",
  abusive: "text-red-200",
  spam: "text-stone",
};

export function Inbox({ platforms, initialPlatform, initialPostId }: { platforms: Platform[]; initialPlatform?: Platform; initialPostId?: string }) {
  const [status, setStatus] = useState("open");
  const [platform, setPlatform] = useState<Platform | "">(initialPlatform ?? "");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [active, setActive] = useState<Item | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchItems = useCallback(async () => {
    const qs = new URLSearchParams({ status, pageSize: "60" });
    if (platform) qs.set("platform", platform);
    if (kind) qs.set("kind", kind);
    if (initialPostId) qs.set("postId", initialPostId);
    try {
      return (await api<{ items: Item[] }>(`/engagement?${qs}`)).items;
    } catch (err) {
      toast.error(errorMessage(err));
      return [];
    }
  }, [status, platform, kind, initialPostId]);

  useEffect(() => {
    let alive = true;
    fetchItems().then((list) => {
      if (!alive) return;
      setItems(list);
      setActive((a) => list.find((i) => i.id === a?.id) ?? list[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [fetchItems]);

  const reload = () =>
    fetchItems().then((list) => {
      setItems(list);
      setActive((a) => list.find((i) => i.id === a?.id) ?? list[0] ?? null);
    });

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api<{ newItems: number; results: { error?: string }[] }>("/engagement/sync", { method: "POST" });
      const errors = r.results.filter((x) => x.error);
      toast.success(r.newItems ? `${r.newItems} new comment${r.newItems === 1 ? "" : "s"}` : "You're up to date");
      if (errors.length) toast.message(errors.map((e) => e.error).join(" · "));
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="inline-flex rounded-xl bg-black/25 p-1" aria-label="Status">
          {[
            ["open", "To do"],
            ["replied", "Replied"],
            ["ignored", "Ignored"],
            ["all", "All"],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v!)} aria-pressed={status === v} className={cn("rounded-lg px-3 py-1.5 text-sm", status === v ? "bg-white/12 text-white" : "text-fog hover:text-white")}>
              {l}
            </button>
          ))}
        </nav>
        <Select aria-label="Platform" className="w-44" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")}>
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_META[p].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Comments & mentions</option>
          <option value="comment">Comments</option>
          <option value="reply">Thread replies</option>
          <option value="mention">Mentions</option>
        </Select>
        <div className="flex-1" />
        <Button variant="glass" onClick={syncNow} loading={syncing}>
          <RefreshCcw /> Check for new
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <GlassCard className="max-h-[75vh] overflow-y-auto p-2">
          {items === null ? (
            <div className="grid place-items-center py-16">
              <Spinner className="size-6 text-moss" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<MessageCircle />} title={status === "open" ? "Inbox zero" : "Nothing here"} description="New comments and mentions on your connected accounts show up here automatically." />
          ) : (
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setActive(i)}
                    className={cn("flex w-full gap-3 rounded-xl px-3 py-3 text-left transition", active?.id === i.id ? "bg-white/12" : "hover:bg-white/6")}
                    aria-current={active?.id === i.id ? "true" : undefined}
                  >
                    <Avatar item={i} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{i.authorName ?? i.authorHandle ?? "Someone"}</span>
                        <PlatformIcon platform={i.platform} className="size-3 shrink-0 text-fog" />
                        {i.kind === "mention" && <AtSign className="size-3 text-sky-300" aria-label="mention" />}
                        <span className="ml-auto shrink-0 text-[11px] text-stone">{timeAgo(i.occurredAt)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-fog">{i.text}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <StatusBadge status={i.status} className="px-2! text-[10px]!" />
                        {i.repliedBy === "autopilot" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-moss">
                            <Bot className="size-3" /> autopilot
                          </span>
                        )}
                        {i.sentiment && <span className={cn("text-[10px] capitalize", SENTIMENT[i.sentiment])}>{i.sentiment}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {active ? <ReplyPanel key={active.id} item={active} onDone={reload} /> : <GlassCard><EmptyState title="Select a comment" /></GlassCard>}
      </div>
    </div>
  );
}

function Avatar({ item }: { item: Item }) {
  return item.authorAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.authorAvatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-mist">{(item.authorName ?? item.authorHandle ?? "?").slice(0, 1).toUpperCase()}</span>
  );
}

function ReplyPanel({ item, onDone }: { item: Item; onDone: () => void }) {
  const [text, setText] = useState(item.draftReply ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const canReply = PLATFORM_META[item.platform].can.comments === "read_reply";
  const limit = platformLimits(item.platform).maxChars;
  const len = textLength(item.platform, text);

  async function suggest() {
    setBusy("suggest");
    try {
      const r = await api<{ reply: string; shouldReply: boolean; reason: string; sentiment: string }>(`/engagement/${item.id}/suggest`, { method: "POST" });
      setText(r.reply);
      if (!r.shouldReply) toast.message(`AI suggests not replying: ${r.reason}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    try {
      const r = await api<{ url: string | null }>(`/engagement/${item.id}/reply`, { method: "POST", json: { text } });
      toast.success(`Reply posted on ${PLATFORM_META[item.platform].label}`);
      if (r.url) toast.message("Open it on the platform", { action: { label: "Open", onClick: () => window.open(r.url!, "_blank", "noopener") } });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: "ignored" | "new") {
    await api(`/engagement/${item.id}`, { method: "PATCH", json: { status } }).catch((e) => toast.error(errorMessage(e)));
    onDone();
  }

  return (
    <GlassCard className="h-fit">
      <div className="flex items-start gap-3">
        <Avatar item={item} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white">
            <span className="font-semibold">{item.authorName ?? "Someone"}</span> {item.authorHandle && <span className="text-stone">@{item.authorHandle.replace(/^@/, "")}</span>}
          </p>
          <p className="text-xs text-stone">
            {item.kind === "mention" ? "mentioned" : "commented on"} {item.account.displayName} · {timeAgo(item.occurredAt)}
          </p>
        </div>
        <PlatformBadge platform={item.platform} withLabel />
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-xl bg-black/25 p-4 text-[15px] leading-relaxed text-mist">{item.text}</p>
      {item.permalink && (
        <a href={item.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-moss hover:underline">
          View on {PLATFORM_META[item.platform].label} <ExternalLink className="size-3" />
        </a>
      )}

      {item.post && (
        <div className="mt-4 flex gap-3 rounded-xl border border-white/8 p-3">
          {item.post.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.post.thumbnailUrl} alt="" className="size-14 rounded-lg object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-stone">On your post</p>
            <p className="line-clamp-2 text-sm text-fog">{item.post.text ?? "(no caption)"}</p>
          </div>
        </div>
      )}

      {item.autopilotNote && (
        <p className="mt-4 flex gap-2 rounded-xl bg-moss/10 px-3 py-2 text-xs text-moss">
          <Bot className="mt-0.5 size-3.5 shrink-0" /> {item.autopilotNote}
        </p>
      )}

      {item.status === "replied" ? (
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <p className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider">
            <Check className="size-3.5" /> Replied {item.repliedBy === "autopilot" ? "by autopilot" : ""}
          </p>
          {item.replyText}
        </div>
      ) : canReply ? (
        <div className="mt-5">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply on ${PLATFORM_META[item.platform].label}…`} aria-label="Reply" />
          <div className="mt-1 text-right text-xs tabular-nums text-stone">
            <span className={len > limit ? "text-dawn" : undefined}>{len}</span>/{limit}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="glass" onClick={suggest} loading={busy === "suggest"} disabled={!!busy}>
              <Sparkles /> Suggest reply
            </Button>
            <Button variant="ghost" onClick={() => setStatus("ignored")} disabled={!!busy}>
              <EyeOff /> Ignore
            </Button>
            <div className="flex-1" />
            <Button onClick={send} loading={busy === "send"} disabled={!!busy || !text.trim() || len > limit}>
              <Send /> Send reply
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone">Replies are posted on {PLATFORM_META[item.platform].label} immediately, as {item.account.displayName}.</p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-fog">{PLATFORM_META[item.platform].label} doesn&apos;t allow replying through its API. Use the link above to reply there.</p>
      )}
      {item.status === "ignored" && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setStatus("new")}>
          Move back to inbox
        </Button>
      )}
      <p className="mt-4 text-xs text-stone">
        Set up automatic replies in <Link href="/autopilot" className="text-moss hover:underline">Autopilot</Link>.
      </p>
    </GlassCard>
  );
}
