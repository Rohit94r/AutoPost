"use client";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api-client";
import { COMMON_TIMEZONES } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PERSPECTIVES, TONES, TONE_LABEL } from "@/lib/writing";

interface Props {
  userName: string;
  workspace: { name: string };
  brand: { id: string; name: string } | null;
}

const STEPS = ["Workspace", "Your voice", "Privacy"];

const noopSubscribe = () => () => undefined;
function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function OnboardingWizard({ userName, workspace, brand }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(workspace.name);
  const browserTz = useSyncExternalStore(noopSubscribe, detectTimeZone, () => "UTC");
  const [tzChoice, setTz] = useState<string | null>(null);
  const tz = tzChoice ?? browserTz;
  const [brandName, setBrandName] = useState(brand?.name ?? userName);
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("conversational");
  const [perspective, setPerspective] = useState<(typeof PERSPECTIVES)[number]>("first_person");
  const [consent, setConsent] = useState(true);

  async function finish() {
    setBusy(true);
    try {
      await api("/workspace", { method: "PATCH", json: { name, timezone: tz, aiProcessingConsent: consent } });
      const voice = { name: brandName || userName, description: description || null, audience: audience || null, tone, perspective, isDefault: true };
      if (brand) await api(`/brand-profiles/${brand.id}`, { method: "PATCH", json: voice });
      else await api("/brand-profiles", { method: "POST", json: voice });
      await api("/me", { method: "PATCH", json: { timezone: tz, completeOnboarding: true } });
      router.replace("/setup");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  const tzs = [...new Set([tz, ...COMMON_TIMEZONES])];

  return (
    <div className="mx-auto max-w-xl animate-rise">
      <p className="text-center text-sm text-mist/80">Welcome, {userName.split(" ")[0]}</p>
      <h1 className="mt-1 text-center font-display text-5xl text-white">Let&apos;s set up your space</h1>
      <ol className="mx-auto mt-8 flex max-w-sm items-center justify-between" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={cn("grid size-8 place-items-center rounded-full text-xs font-semibold transition", i < step ? "bg-moss text-ink" : i === step ? "bg-white text-ink" : "bg-white/15 text-fog")} aria-current={i === step ? "step" : undefined}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-xs", i === step ? "text-white" : "text-fog")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px flex-1 bg-white/15" />}
          </li>
        ))}
      </ol>

      <div className="glass-strong mt-8 p-7">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Workspace name" htmlFor="ws">
              <Input id="ws" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Time zone" htmlFor="tz" hint="Scheduled posts use this zone by default. You can change it per post.">
              <Select id="tz" value={tz} onChange={(e) => setTz(e.target.value)}>
                {tzs.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Name you post as" htmlFor="bn">
              <Input id="bn" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </Field>
            <Field label="A line about you or your brand" htmlFor="bd" hint="Helps the AI write with real context. It won't invent anything beyond this.">
              <Textarea id="bd" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Final-year CS student building data tools; organiser of our campus AI club." />
            </Field>
            <Field label="Who you're writing for" htmlFor="au">
              <Input id="au" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Recruiters and fellow developers" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default tone" htmlFor="tone">
                <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {TONE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Voice" htmlFor="persp">
                <Select id="persp" value={perspective} onChange={(e) => setPerspective(e.target.value as typeof perspective)}>
                  <option value="first_person">First person (I)</option>
                  <option value="brand_we">Team / brand (we)</option>
                  <option value="third_person">Third person</option>
                </Select>
              </Field>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-xl bg-black/25 p-4">
              <div>
                <p className="text-sm font-medium text-white">Allow AI processing</p>
                <p className="mt-1 text-sm text-fog">
                  When you use AI features, the text or documents you choose are sent to the configured provider (Groq for fast writing, Google Gemini for documents).
                  Nothing is sent unless you trigger it.
                </p>
              </div>
              <Switch checked={consent} onCheckedChange={setConsent} label="Allow AI processing" />
            </div>
            <Notice tone="info" title="Next: connect your apps">
              The Get started guide walks you through connecting Instagram, LinkedIn, X and the rest, one step at a time. Each uses the platform&apos;s own sign-in, so Verdant never sees your passwords.
            </Notice>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || busy}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !name.trim()}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} loading={busy}>
              Enter Verdant <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
