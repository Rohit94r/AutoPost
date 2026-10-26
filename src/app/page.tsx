import { ArrowRight, BadgeCheck, CalendarClock, FileScan, Fingerprint, Layers3, RefreshCcw, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform";
import { PLANS } from "@/lib/plans";
import { formatBytes } from "@/lib/utils";

export default function Landing() {
  return (
    <div className="relative overflow-x-clip">
      <Nav />
      <Hero />
      <Proof />
      <HowItWorks />
      <DocumentFeature />
      <Reliability />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-5">
      <nav className="glass mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl! px-3 pl-4" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-1 text-sm text-fog md:flex">
          {[
            ["#how", "How it works"],
            ["#documents", "Documents"],
            ["#reliability", "Reliability"],
            ["#pricing", "Pricing"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-1.5 transition hover:bg-white/10 hover:text-white">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="light" size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] items-center pb-24 pt-32">
      <Image src="/images/hero-peaks.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-center" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-black/45 via-black/25 to-ink" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(252,213,154,0.18),transparent_55%)]" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-rise">
          <span className="glass inline-flex items-center gap-2 rounded-full! px-3 py-1.5 text-xs text-mist">
            <Sparkles className="size-3.5 text-sun" /> AI writing with Groq &amp; Gemini · Official platform APIs
          </span>
          <h1 className="mt-6 font-display text-[3.4rem] leading-[0.98] text-white sm:text-7xl lg:text-[5.4rem]">
            Create once.
            <br />
            <em className="text-gradient not-italic">Publish everywhere.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-mist/85">
            Drop in an idea, a certificate or an event poster. Verdant pulls out the facts, lets you check them, and writes natural posts for LinkedIn, Instagram
            and X that you can edit, schedule and publish in one place.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start for free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="glass">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <div className="mt-10 flex items-center gap-4 text-sm text-fog">
            <div className="flex -space-x-2">
              {(["linkedin", "instagram", "x"] as const).map((p) => (
                <span key={p} className="glass grid size-9 place-items-center rounded-full! text-white">
                  <PlatformIcon platform={p} />
                </span>
              ))}
            </div>
            We never ask for your social passwords. Accounts connect through each platform&apos;s own OAuth.
          </div>
        </div>

        <HeroMock />
      </div>
    </section>
  );
}

function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="glass-strong animate-rise p-5 [animation-delay:150ms]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-white">
            <Wand2 className="size-4 text-moss" /> Composer
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-fog">Illustration</span>
        </div>
        <div className="glass-input p-3 text-sm leading-relaxed text-mist/90">
          Finished the Google Data Analytics certificate. 8 courses, capstone on bike-share retention.
        </div>
        <div className="mt-4 space-y-2.5">
          {[
            { p: "linkedin" as const, t: "Eight courses, one capstone, and a much better feel for messy data. I just completed the Google Data Analytics certificate…" },
            { p: "instagram" as const, t: "Certificate unlocked ✦ 8 courses + a capstone on bike-share retention. Swipe for what I learned →" },
            { p: "x" as const, t: "Done: Google Data Analytics cert. Capstone = why bike-share riders churn. Writeup soon." },
          ].map((v, i) => (
            <div key={v.p} className="flex gap-3 rounded-xl bg-black/25 p-3 animate-rise" style={{ animationDelay: `${300 + i * 120}ms` }}>
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                <PlatformIcon platform={v.p} className="size-3.5" />
              </span>
              <p className="text-[13px] leading-snug text-mist/85">{v.t}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-moss/10 px-3 py-2 text-xs text-moss">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> Scheduled · Tue 09:30 IST
          </span>
          <span>3 destinations</span>
        </div>
      </div>
      <div className="glass absolute -left-6 -top-8 hidden animate-float items-center gap-2 rounded-2xl! px-3 py-2 text-xs text-mist sm:flex">
        <FileScan className="size-4 text-sun" /> 7 facts extracted from certificate.pdf
      </div>
      <div className="glass absolute -bottom-7 -right-4 hidden animate-float items-center gap-2 rounded-2xl! px-3 py-2 text-xs text-mist [animation-delay:1.5s] sm:flex">
        <BadgeCheck className="size-4 text-moss" /> You reviewed every fact
      </div>
    </div>
  );
}

function Proof() {
  return (
    <section className="relative border-y border-white/8 bg-ink py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 text-sm text-fog">
        <span className="inline-flex items-center gap-2">
          <PlatformIcon platform="linkedin" /> LinkedIn Posts API
        </span>
        <span className="inline-flex items-center gap-2">
          <PlatformIcon platform="instagram" /> Instagram Graph API
        </span>
        <span className="inline-flex items-center gap-2">
          <PlatformIcon platform="x" /> X API v2
        </span>
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4" /> Groq · Gemini
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-4" /> AES-256 encrypted tokens
        </span>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Layers3, title: "Start anywhere", text: "A rough idea, a draft, or a document: PDF, certificate, poster, internship letter." },
  { icon: FileScan, title: "Understand the source", text: "Text extraction and Gemini vision pull structured facts, with evidence and confidence." },
  { icon: BadgeCheck, title: "You check the facts", text: "Correct anything before writing. Nothing unverified slips into your post." },
  { icon: Wand2, title: "Write per platform", text: "Separate LinkedIn, Instagram and X versions in your brand voice, each fully editable." },
  { icon: CalendarClock, title: "Publish or schedule", text: "One job per destination, tracked independently, with history and safe retries." },
];

function HowItWorks() {
  return (
    <section id="how" className="relative isolate py-28">
      <Image src="/images/feature-lake.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-55" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink via-ink/55 to-ink" />
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="How it works" title={<>From source to post, <em className="text-gradient not-italic">without the busywork.</em></>} />
        <ol className="mt-14 grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass group p-5 transition hover:-translate-y-1 hover:bg-white/[0.11]">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-moss transition group-hover:scale-110">
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-3xl text-white/25">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-semibold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fog">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DocumentFeature() {
  const fields = [
    ["Recipient", "Aarav Mehta", "high"],
    ["Certificate", "Google Data Analytics", "high"],
    ["Issuer", "Google · Coursera", "high"],
    ["Issue date", "12 Sep 2026", "medium"],
    ["Credential ID", "—  not found", "missing"],
  ];
  return (
    <section id="documents" className="relative py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <SectionHead align="left" eyebrow="Document intelligence" title={<>Your certificate, <em className="text-gradient not-italic">read carefully.</em></>} />
          <ul className="mt-8 space-y-4 text-[15px] text-mist/85">
            {[
              "PDF text extraction first, Gemini OCR for scans and images",
              "Document-type-aware fields: no forced, irrelevant boxes",
              "Confidence, evidence snippets and page references",
              "Facts from the document are kept separate from claims you add",
              "Embedded instructions inside documents are ignored",
              "We never claim a certificate is authentic just because we read it",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-moss" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-strong p-6" aria-hidden>
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="text-white">certificate.pdf · Certificate</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-fog">Illustration</span>
          </div>
          <div className="space-y-2">
            {fields.map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-black/25 px-3.5 py-2.5 text-sm">
                <span className="text-fog">{k}</span>
                <span className="flex items-center gap-2 text-white">
                  {v}
                  <span className={`size-2 rounded-full ${c === "high" ? "bg-moss" : c === "medium" ? "bg-sun" : "bg-dawn"}`} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-stone">Green = clearly printed · Amber = check this · Red = missing, so it stays out of the post</p>
        </div>
      </div>
    </section>
  );
}

function Reliability() {
  const items = [
    { icon: Fingerprint, title: "Idempotent by design", text: "Double-clicks and retried requests can't create duplicate posts." },
    { icon: RefreshCcw, title: "Partial success, handled", text: "If Instagram fails but LinkedIn succeeds, only Instagram is retried." },
    { icon: CalendarClock, title: "Survives restarts", text: "Schedules live in Postgres; a persistent worker recovers anything due." },
    { icon: ShieldCheck, title: "Honest results", text: "Marked published only after the platform returns a post ID. No fake analytics." },
  ];
  return (
    <section id="reliability" className="relative isolate py-28">
      <Image src="/images/golden-valley.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-45" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink via-ink/60 to-ink" />
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="Publishing engine" title={<>Built to be trusted <em className="text-gradient not-italic">with your name.</em></>} />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <div key={i.title} className="glass p-6">
              <i.icon className="size-6 text-sun" />
              <h3 className="mt-4 font-semibold text-white">{i.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fog">{i.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead eyebrow="Plans" title={<>Simple limits, <em className="text-gradient not-italic">enforced fairly.</em></>} />
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-fog">Online checkout isn&apos;t live yet. Every workspace starts on Free, and admins can upgrade plans.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {Object.entries(PLANS).map(([id, p]) => (
            <div key={id} className={`p-7 ${id === "pro" ? "glass-strong ring-1 ring-moss/40" : "glass"}`}>
              <h3 className="font-display text-3xl text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-fog">{p.description}</p>
              <ul className="mt-6 space-y-2.5 text-sm text-mist/90">
                <li>{p.limits.aiRequestsPerMonth.toLocaleString()} AI requests / month</li>
                <li>{p.limits.documentsPerMonth} documents / month</li>
                <li>{p.limits.publishingJobsPerMonth.toLocaleString()} publishes / month</li>
                <li>{p.limits.connectedAccounts} connected accounts</li>
                <li>{formatBytes(p.limits.storageBytes)} storage</li>
                <li>
                  {p.limits.members} member{p.limits.members > 1 ? "s" : ""}
                </li>
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-24">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem]">
        <Image src="/images/cta-bridge.webp" alt="" fill sizes="(max-width: 1200px) 100vw, 1200px" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/75 via-black/45 to-black/20" />
        <div className="px-8 py-20 sm:px-14">
          <h2 className="max-w-xl font-display text-5xl leading-tight text-white">Your next post is already in a document somewhere.</h2>
          <p className="mt-4 max-w-md text-mist/85">Upload it, check the facts, and publish it everywhere in a few minutes.</p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/sign-up">
              Create your workspace <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/8 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-stone sm:flex-row">
        <Logo />
        <p>© {new Date().getFullYear()} Verdant. Photos from Unsplash.</p>
        <div className="flex gap-4">
          <Link href="/help" className="hover:text-white">
            Help &amp; privacy
          </Link>
          <Link href="/sign-in" className="hover:text-white">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

function SectionHead({ eyebrow, title, align = "center" }: { eyebrow: string; title: React.ReactNode; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss">{eyebrow}</p>
      <h2 className="mt-3 font-display text-5xl leading-[1.05] text-white md:text-6xl">{title}</h2>
    </div>
  );
}
