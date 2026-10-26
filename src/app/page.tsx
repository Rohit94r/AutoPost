import { ArrowRight, BadgeCheck, Bot, ChevronRight, Fingerprint, Inbox, KeyRound, Lock, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Highlights } from "@/components/landing/highlights";
import { Reveal } from "@/components/landing/reveal";
import { Story } from "@/components/landing/story";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform";
import { PLATFORM_META, PLATFORMS } from "@/lib/platforms";
import { PLANS } from "@/lib/plans";
import { formatBytes } from "@/lib/utils";

export default function Landing() {
  return (
    <div className="relative overflow-x-clip bg-ink">
      <Nav />
      <Hero />
      <section className="py-24" aria-labelledby="highlights">
        <div className="mx-auto mb-10 max-w-6xl px-5">
          <h2 id="highlights" className="font-display text-5xl text-white md:text-6xl">
            Get the highlights.
          </h2>
        </div>
        <Highlights />
      </section>

      <section id="story" className="relative bg-[radial-gradient(ellipse_at_75%_35%,rgba(74,222,128,0.10),transparent_55%),radial-gradient(ellipse_at_15%_70%,rgba(252,213,154,0.07),transparent_50%)] py-16" aria-labelledby="story-title">
        <Reveal className="mx-auto max-w-4xl px-5 text-center">
          <p className="text-sm font-medium text-moss">A story in six moments</p>
          <h2 id="story-title" className="mt-3 font-display text-5xl leading-[1.05] text-white md:text-7xl">
            From “I did a thing” to <span className="text-gradient">everyone knowing.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-fog">Here&apos;s what Verdant does, told as one afternoon in one person&apos;s life.</p>
        </Reveal>
        <div className="mt-10">
          <Story />
        </div>
      </section>

      <Platforms />
      <Bento />
      <Privacy />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/8 bg-ink/60 backdrop-blur-xl backdrop-saturate-150">
      <nav className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5 text-[13px]" aria-label="Main">
        <Logo className="[&_span]:text-xl [&_svg]:size-6" />
        <div className="hidden items-center gap-7 text-fog md:flex">
          {[
            ["#story", "How it works"],
            ["#platforms", "Platforms"],
            ["#features", "Features"],
            ["#privacy", "Privacy"],
            ["#pricing", "Pricing"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-white">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-fog hover:text-white">
            Sign in
          </Link>
          <Button asChild size="sm" className="h-7 rounded-full px-3.5">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col items-center justify-start overflow-hidden px-5 pt-32 text-center">
      <Image src="/images/hero-peaks.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-bottom" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/80 via-ink/20 to-ink" />
      <p className="animate-rise text-lg font-medium text-sun">Verdant</p>
      <h1 className="mt-3 max-w-5xl animate-rise font-display text-[3.6rem] leading-[0.95] tracking-tight text-white [animation-delay:120ms] sm:text-8xl lg:text-[8.5rem]">
        Say it once.
        <br />
        <span className="text-gradient">Be heard everywhere.</span>
      </h1>
      <p className="mt-7 max-w-2xl animate-rise text-xl leading-relaxed text-mist/90 [animation-delay:240ms] md:text-2xl">
        Turn an idea or a certificate into posts for 15 platforms, in your voice. Then answer every comment from one inbox.
      </p>
      <div className="mt-8 flex animate-rise flex-wrap items-center justify-center gap-x-8 gap-y-3 text-lg [animation-delay:360ms]">
        <Button asChild size="lg" className="rounded-full px-7">
          <Link href="/sign-up">Start free</Link>
        </Button>
        <a href="#story" className="inline-flex items-center gap-1 text-moss hover:underline">
          See how it works <ChevronRight className="size-5" />
        </a>
      </div>
      <div className="mt-14 flex animate-rise flex-wrap items-center justify-center gap-2 [animation-delay:480ms]">
        {PLATFORMS.map((p) => (
          <span key={p} className="glass grid size-10 place-items-center rounded-full! text-white" title={PLATFORM_META[p].label}>
            <PlatformIcon platform={p} className="size-4" />
          </span>
        ))}
      </div>
    </section>
  );
}

function Platforms() {
  return (
    <section id="platforms" className="relative isolate py-28">
      <Image src="/images/feature-lake.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-40" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink via-ink/70 to-ink" />
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-5xl text-white md:text-7xl">Every platform. One place.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-fog">Official sign-in for each network. Each post is shaped for its platform: length, tone, hashtags and format.</p>
        </Reveal>
        <ul className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p} as="li" delay={i * 40}>
              <div className="glass flex h-full flex-col items-start gap-3 p-5 transition hover:-translate-y-1 hover:bg-white/[0.11]">
                <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ backgroundColor: `${PLATFORM_META[p].color}33`, boxShadow: `inset 0 0 0 1px ${PLATFORM_META[p].color}55` }}>
                  <PlatformIcon platform={p} className="size-5" />
                </span>
                <span className="font-medium text-white">{PLATFORM_META[p].label}</span>
                <span className="text-xs text-stone">
                  {[PLATFORM_META[p].can.publish && "Publish", PLATFORM_META[p].can.comments === "read_reply" && "Replies", PLATFORM_META[p].can.metrics && "Analytics"].filter(Boolean).join(" · ")}
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Bento() {
  return (
    <section id="features" className="py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <h2 className="font-display text-5xl text-white md:text-7xl">
            Built for the busy part
            <br />
            <span className="text-gradient">of your day.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <div className="relative isolate h-full min-h-80 overflow-hidden rounded-[2rem] p-8">
              <Image src="/images/golden-valley.webp" alt="" fill sizes="(max-width: 768px) 100vw, 66vw" className="-z-20 object-cover" />
              <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/80 via-black/50 to-transparent" />
              <Inbox className="size-8 text-sun" />
              <h3 className="mt-6 max-w-md font-display text-4xl text-white">One inbox for every comment and mention.</h3>
              <p className="mt-3 max-w-md text-mist/85">Instagram, Facebook, YouTube, Threads, Reddit, Bluesky and more. See which post each comment is on, reply right there, and it goes out on the platform.</p>
            </div>
          </Reveal>
          <Reveal className="md:col-span-2" delay={80}>
            <div className="glass h-full p-8">
              <Bot className="size-8 text-moss" />
              <h3 className="mt-6 font-display text-3xl text-white">Autopilot that knows when to stop.</h3>
              <p className="mt-3 text-fog">It thanks fans and answers simple questions in your voice. Spam is ignored, and anything negative waits for you.</p>
            </div>
          </Reveal>
          <Reveal className="md:col-span-2">
            <div className="glass h-full p-8">
              <BadgeCheck className="size-8 text-sun" />
              <h3 className="mt-6 font-display text-3xl text-white">Facts first.</h3>
              <p className="mt-3 text-fog">Upload a certificate, letter or poster. Check what was read. Only confirmed facts make it into your post.</p>
            </div>
          </Reveal>
          <Reveal className="md:col-span-2" delay={80}>
            <div className="glass h-full p-8">
              <Sparkles className="size-8 text-moss" />
              <h3 className="mt-6 font-display text-3xl text-white">Sounds like you.</h3>
              <p className="mt-3 text-fog">Brand voice learned from your own posts. One tap to make a draft sound more natural and more human.</p>
            </div>
          </Reveal>
          <Reveal className="md:col-span-2" delay={160}>
            <div className="glass h-full p-8">
              <Fingerprint className="size-8 text-sun" />
              <h3 className="mt-6 font-display text-3xl text-white">Never posts twice.</h3>
              <p className="mt-3 text-fog">Each platform gets its own job. A failure on one never reposts on another, and a post is only marked done when the platform confirms it.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    { icon: KeyRound, title: "No passwords. Ever.", text: "Accounts connect through each platform's own sign-in or official app tokens." },
    { icon: Lock, title: "Encrypted tokens.", text: "Connection tokens are encrypted on the server (AES-256-GCM) and never sent to your browser." },
    { icon: ShieldCheck, title: "Your content stays yours.", text: "No ads, no selling data, no training AI on your posts or documents." },
    { icon: Trash2, title: "Delete means delete.", text: "Documents expire automatically. Export or erase everything whenever you like." },
  ];
  return (
    <section id="privacy" className="relative isolate py-32">
      <Image src="/images/auth-hills.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-50" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink via-ink/60 to-ink" />
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <Lock className="mx-auto size-12 text-white" />
          <h2 className="mt-6 font-display text-5xl text-white md:text-7xl">Privacy, built in.</h2>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <div className="glass h-full p-6">
                <p.icon className="size-6 text-moss" />
                <h3 className="mt-4 font-semibold text-white">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fog">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-stone">
          Read the <Link href="/privacy" className="text-moss underline">Privacy Policy</Link> and <Link href="/terms" className="text-moss underline">Terms</Link>.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-5xl text-white md:text-7xl">Which plan is right for you?</h2>
          <p className="mx-auto mt-4 max-w-xl text-fog">Every workspace starts free. Online checkout is coming; until then, admins upgrade plans.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {Object.entries(PLANS).map(([id, p], i) => (
            <Reveal key={id} delay={i * 80}>
              <div className={`h-full p-8 text-center ${id === "pro" ? "glass-strong ring-1 ring-moss/40" : "glass"}`}>
                {id === "pro" && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-moss">Most popular</p>}
                <h3 className="font-display text-4xl text-white">{p.name}</h3>
                <p className="mt-2 text-sm text-fog">{p.description}</p>
                <ul className="mt-6 space-y-3 border-t border-white/10 pt-6 text-sm text-mist/90">
                  <li>{p.limits.connectedAccounts} connected accounts</li>
                  <li>{p.limits.publishingJobsPerMonth.toLocaleString()} posts a month</li>
                  <li>{p.limits.aiRequestsPerMonth.toLocaleString()} AI requests a month</li>
                  <li>{p.limits.documentsPerMonth} documents a month</li>
                  <li>{formatBytes(p.limits.storageBytes)} storage</li>
                  <li>
                    {p.limits.members} team member{p.limits.members > 1 ? "s" : ""}
                  </li>
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-24">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2.5rem]">
        <Image src="/images/cta-bridge.webp" alt="" fill sizes="(max-width: 1200px) 100vw, 1200px" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/40 to-black/10" />
        <div className="flex min-h-[60vh] flex-col items-center justify-end px-8 pb-16 text-center">
          <h2 className="max-w-3xl font-display text-5xl leading-tight text-white md:text-7xl">Your next post is already waiting.</h2>
          <p className="mt-4 max-w-lg text-lg text-mist/85">Connect your accounts in minutes. Your first post is free.</p>
          <Button asChild size="lg" className="mt-8 rounded-full px-8">
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
    <footer className="border-t border-white/8 py-10 text-[13px]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-stone sm:flex-row">
        <Logo />
        <p>© {new Date().getFullYear()} Verdant. Photos from Unsplash.</p>
        <div className="flex gap-4">
          <Link href="/help" className="hover:text-white">
            Help
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/data-deletion" className="hover:text-white">
            Data deletion
          </Link>
        </div>
      </div>
    </footer>
  );
}
