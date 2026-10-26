import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Help & privacy" };

const FAQ: [string, React.ReactNode][] = [
  ["How do accounts connect?", "Through each platform's official OAuth screen. Verdant never asks for or sees your social passwords. Tokens are encrypted (AES-256-GCM) on the server and never sent to your browser."],
  ["Why can't I publish to my Instagram account?", "Instagram only allows API publishing for professional (Business or Creator) accounts, and Instagram must be able to download your image or video from a public HTTPS address. JPEG is required; PNG and WebP are converted automatically."],
  ["Why does LinkedIn ask me to reconnect every ~60 days?", "LinkedIn access tokens last 60 days and LinkedIn only offers automatic refresh to approved partners. Verdant reminds you a week ahead."],
  ["Does X cost anything?", "X's API is pay-per-use for the developer account running this Verdant instance, and posts containing links cost more. The composer warns you when a link is included."],
  ["What happens if one platform fails?", "Each destination is its own job. If LinkedIn succeeds and Instagram fails, you'll see a partial result and can retry only Instagram. If we can't tell whether a post went live (for example a timeout during publishing), we never retry automatically; we ask you to check first, to avoid duplicates."],
  ["What does the AI see?", "Only what you send: your idea, draft, or a document you upload with explicit consent. Text tasks use Groq; documents use Google Gemini. Documents are never re-routed to another provider. Instructions hidden inside documents are ignored."],
  ["Will the AI invent achievements?", "It's instructed not to, and every draft is checked for figures that aren't in your source, which are flagged for you. You review and edit everything before publishing. Reading a certificate does not verify that it's authentic."],
  ["Is the text 'undetectable'?", "We don't promise that. We aim for clear, specific, natural writing in your voice."],
  ["How long are documents kept?", "Original files are deleted after your workspace's retention period (30 days by default, configurable in Settings). Reviewed facts stay until you delete the document."],
  ["Can I export or delete my data?", <>Yes. Export your workspace as JSON from Settings, and delete your account from Settings → Account &amp; security.</>],
];

export default function HelpPage() {
  return (
    <div className="relative isolate min-h-dvh px-4 pb-20 pt-24">
      <Image src="/images/feature-lake.webp" alt="" fill sizes="100vw" className="-z-20 object-cover opacity-50" />
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/70 via-ink/85 to-ink" />
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4">
        <Logo />
        <Button asChild size="sm" variant="glass">
          <Link href="/dashboard">Open app</Link>
        </Button>
      </header>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-moss">Help &amp; privacy</p>
        <h1 className="mt-2 font-display text-5xl text-white">Straight answers</h1>
        <p className="mt-3 text-sm text-fog">
          Read the full <Link href="/terms" className="text-moss underline">Terms of Service</Link>, <Link href="/privacy" className="text-moss underline">Privacy Policy</Link> and{" "}
          <Link href="/data-deletion" className="text-moss underline">data deletion instructions</Link>.
        </p>
        <div className="mt-8 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="glass group p-5 open:bg-white/[0.09]">
              <summary className="cursor-pointer list-none text-[15px] font-medium text-white marker:hidden">
                <span className="mr-2 inline-block text-moss transition group-open:rotate-90">›</span>
                {q}
              </summary>
              <div className="mt-3 pl-5 text-sm leading-relaxed text-fog">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
