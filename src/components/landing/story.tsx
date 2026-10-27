"use client";
import { Bot, CalendarClock, Check, FileScan, Heart, MessageCircle, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformIcon } from "@/components/ui/platform";
import type { Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * Scroll-driven story: a sticky "device" on one side changes scene as each chapter of the
 * story scrolls past. Explains the whole product as one person's afternoon.
 */
const CHAPTERS = [
  {
    kicker: "4:10 pm",
    title: "Aanya wins her first hackathon.",
    body: "She has a certificate, a team photo and a lot to say. She doesn't have an hour per platform to say it.",
  },
  {
    kicker: "4:12 pm",
    title: "She drops the certificate into FLOWT.",
    body: "FLOWT reads it, scanned PDF or phone photo, and pulls out the facts: the event, the award, the date, the organiser. Each one comes with the exact line it was read from.",
  },
  {
    kicker: "4:13 pm",
    title: "She checks every fact.",
    body: "The date was blurry, so she fixes it. Nothing she hasn't confirmed can end up in a post. FLOWT never claims the certificate is genuine just because it read it.",
  },
  {
    kicker: "4:15 pm",
    title: "It writes in her voice, for every platform.",
    body: "A thoughtful LinkedIn post. A short Instagram caption. A crisp line for X. Each one shaped for its platform, each one hers to edit.",
  },
  {
    kicker: "4:16 pm",
    title: "She picks a time. FLOWT does the rest.",
    body: "Scheduled for tomorrow, 9:30 IST, on every account she chose. Each one is tracked separately, so one failure never blocks the others, and nothing is ever posted twice.",
  },
  {
    kicker: "Next morning",
    title: "The comments roll in. Autopilot says thank you.",
    body: "Comments from every platform land in one inbox. Autopilot thanks supporters in her voice and saves the tricky questions for her.",
  },
];

function Scene({ i }: { i: number }) {
  const base = "absolute inset-0 flex flex-col p-6 transition-all duration-700";
  const vis = (n: number) => (i === n ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-4");
  return (
    <div className="relative h-full overflow-hidden" aria-hidden>
      <div className={cn(base, "items-center justify-center text-center", vis(0))}>
        <div className="glass w-full max-w-xs rounded-3xl! p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-sun">Certificate of achievement</p>
          <p className="mt-3 font-display text-3xl text-white">First place</p>
          <p className="mt-1 text-sm text-fog">Campus Build-a-thon 2026</p>
          <div className="mx-auto mt-5 h-px w-24 bg-white/20" />
          <p className="mt-3 text-xs text-stone">Awarded to Team Lumen</p>
        </div>
      </div>
      <div className={cn(base, "justify-center gap-2", vis(1))}>
        <p className="mb-2 inline-flex items-center gap-2 text-sm text-moss">
          <FileScan className="size-4" /> Reading certificate.pdf…
        </p>
        {[
          ["Event", "Campus Build-a-thon 2026"],
          ["Result", "First place"],
          ["Team", "Team Lumen"],
          ["Date", "18 Oct 2026"],
          ["Organiser", "CS Society"],
        ].map(([k, v], n) => (
          <div key={k} className="flex items-center justify-between rounded-xl bg-black/35 px-4 py-2.5 text-sm animate-rise" style={{ animationDelay: `${n * 90}ms` }}>
            <span className="text-fog">{k}</span>
            <span className="text-white">{v}</span>
          </div>
        ))}
      </div>
      <div className={cn(base, "justify-center gap-2", vis(2))}>
        {[
          ["Result", "First place", true],
          ["Date", "18 Oct 2026", false],
          ["Team", "Team Lumen", true],
        ].map(([k, v, ok]) => (
          <div key={String(k)} className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm", ok ? "bg-black/35" : "bg-sun/15 ring-1 ring-sun/40")}>
            <span className="text-fog">{k}</span>
            <span className="flex items-center gap-2 text-white">
              {v} {ok ? <Check className="size-4 text-moss" /> : <span className="text-[11px] text-sun">check this</span>}
            </span>
          </div>
        ))}
        <p className="mt-3 text-center text-xs text-stone">Green means confirmed. Unconfirmed facts stay out of the post.</p>
      </div>
      <div className={cn(base, "justify-center gap-3", vis(3))}>
        {(
          [
            ["linkedin", "Three days, four teammates and one very stubborn bug later, Team Lumen took first place at Campus Build-a-thon 2026…"],
            ["instagram", "First place 🏆 Build-a-thon 2026. Swipe for the 3am debugging face."],
            ["x", "We won Campus Build-a-thon 2026 🎉 Huge thanks to my team. Write-up soon."],
          ] as [Platform, string][]
        ).map(([p, t], n) => (
          <div key={p} className="flex gap-3 rounded-2xl bg-black/35 p-3 animate-rise" style={{ animationDelay: `${n * 120}ms` }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
              <PlatformIcon platform={p} className="size-4" />
            </span>
            <p className="text-[13px] leading-snug text-mist">{t}</p>
          </div>
        ))}
        <p className="inline-flex items-center gap-1.5 text-xs text-moss">
          <Sparkles className="size-3.5" /> Every version can be edited
        </p>
      </div>
      <div className={cn(base, "items-center justify-center text-center", vis(4))}>
        <CalendarClock className="size-10 text-moss" />
        <p className="mt-4 font-display text-4xl text-white">Tomorrow, 9:30</p>
        <p className="text-sm text-fog">Asia/Kolkata · 3 destinations</p>
        <div className="mt-6 flex gap-2">
          {(["linkedin", "instagram", "x"] as Platform[]).map((p) => (
            <span key={p} className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs text-mist">
              <PlatformIcon platform={p} className="size-3.5" /> Scheduled
            </span>
          ))}
        </div>
      </div>
      <div className={cn(base, "justify-center gap-2", vis(5))}>
        {[
          ["Riya", "Congrats!! So well deserved 👏", "Thank you Riya! Couldn't have done it without the late-night pizza 🍕", true],
          ["Dev", "What stack did you use?", "Next.js + a tiny Python service. Full write-up coming this week!", true],
          ["Unknown", "DM me for cheap followers", null, false],
        ].map(([who, msg, reply, ok], n) => (
          <div key={String(who)} className="rounded-2xl bg-black/35 p-3 text-sm animate-rise" style={{ animationDelay: `${n * 140}ms` }}>
            <p className="flex items-center gap-2 text-white">
              <MessageCircle className="size-3.5 text-fog" /> <span className="font-medium">{who}</span> <span className="text-fog">{msg}</span>
            </p>
            {reply ? (
              <p className="mt-2 flex items-start gap-2 pl-5 text-[13px] text-moss">
                <Bot className="mt-0.5 size-3.5 shrink-0" /> {reply}
              </p>
            ) : (
              <p className="mt-2 pl-5 text-[12px] text-stone">{ok ? "" : "Spam, so it's ignored and never answered"}</p>
            )}
          </div>
        ))}
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-dawn">
          <Heart className="size-3.5" /> 184 likes · 23 comments across 3 platforms
        </p>
      </div>
    </div>
  );
}

export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2">
      <div className="order-2 lg:order-1">
        {CHAPTERS.map((c, i) => (
          <div
            key={c.title}
            data-index={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={cn("flex min-h-[70vh] flex-col justify-center transition-opacity duration-500", active === i ? "opacity-100" : "opacity-30")}
          >
            <p className="text-sm font-medium text-moss">{c.kicker}</p>
            <h3 className="mt-3 font-display text-4xl leading-tight text-white md:text-5xl">{c.title}</h3>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-fog">{c.body}</p>
            {/* Mobile: show the scene inline under each chapter */}
            <div className="glass-strong relative mt-8 h-96 rounded-[2rem]! lg:hidden">
              <Scene i={i} />
            </div>
          </div>
        ))}
      </div>
      <div className="order-1 hidden lg:order-2 lg:block">
        <div className="sticky top-[15vh]">
          <div className="glass-strong relative mx-auto h-[70vh] max-h-[640px] w-full max-w-md rounded-[2.5rem]! ring-1 ring-white/10">
            <div className="absolute left-1/2 top-3 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/15" />
            <Scene i={active} />
          </div>
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
            {CHAPTERS.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", active === i ? "w-6 bg-moss" : "w-1.5 bg-white/25")} />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">
        <Send /> Story of a post from document to published
      </span>
    </div>
  );
}
