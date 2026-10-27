"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

const TILES = [
  { img: "/images/hero-peaks.webp", kicker: "Write once", title: "One idea. Fifteen platforms. Each in its own voice.", tone: "from-black/70" },
  { img: "/images/feature-lake.webp", kicker: "Documents", title: "Turn a certificate into a post in under a minute.", tone: "from-black/70" },
  { img: "/images/app-forest.webp", kicker: "Inbox", title: "Every comment, from every platform, in one place.", tone: "from-black/75" },
  { img: "/images/golden-valley.webp", kicker: "Autopilot", title: "Replies in your voice, even while you sleep.", tone: "from-black/70" },
  { img: "/images/cta-bridge.webp", kicker: "Analytics", title: "Real numbers from the platforms, never invented.", tone: "from-black/75" },
  { img: "/images/auth-hills.webp", kicker: "Privacy", title: "Your passwords never touch FLOWT.", tone: "from-black/70" },
];

/** "Get the highlights" — a snap-scrolling row of large tiles. */
export function Highlights() {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div>
      <div ref={row} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 [scrollbar-width:none] md:px-[max(1.25rem,calc((100vw-72rem)/2))]">
        {TILES.map((t) => (
          <figure key={t.title} className="relative isolate h-[60vh] max-h-[560px] min-h-[420px] w-[82vw] shrink-0 snap-center overflow-hidden rounded-[2rem] sm:w-[60vw] lg:w-[34rem]">
            <Image src={t.img} alt="" fill sizes="(max-width: 768px) 82vw, 544px" className="-z-20 object-cover transition duration-700 hover:scale-105" />
            <div className={`absolute inset-0 -z-10 bg-linear-to-t ${t.tone} via-black/10 to-transparent`} />
            <figcaption className="absolute inset-x-0 bottom-0 p-8">
              <p className="text-sm font-medium text-sun">{t.kicker}</p>
              <p className="mt-2 font-display text-3xl leading-tight text-white md:text-4xl">{t.title}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="mx-auto mt-4 flex max-w-6xl justify-end gap-2 px-5">
        <button onClick={() => scroll(-1)} className="glass grid size-11 place-items-center rounded-full! text-white" aria-label="Previous highlight">
          <ChevronLeft className="size-5" />
        </button>
        <button onClick={() => scroll(1)} className="glass grid size-11 place-items-center rounded-full! text-white" aria-label="Next highlight">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
