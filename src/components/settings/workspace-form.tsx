"use client";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CardTitle, GlassCard } from "@/components/ui/misc";
import { Switch } from "@/components/ui/overlay";
import { api, errorMessage } from "@/lib/api-client";
import { COMMON_TIMEZONES } from "@/lib/time";

export function WorkspaceForm({ ws, canEdit }: { ws: { name: string; timezone: string; documentRetentionDays: number; aiConsent: boolean }; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(ws.name);
  const [tz, setTz] = useState(ws.timezone);
  const [retention, setRetention] = useState(ws.documentRetentionDays);
  const [consent, setConsent] = useState(ws.aiConsent);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api("/workspace", { method: "PATCH", json: { name, timezone: tz, documentRetentionDays: retention, aiProcessingConsent: consent } });
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <CardTitle>Workspace</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="wn">
            <Input id="wn" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Default time zone" htmlFor="wtz">
            <Select id="wtz" value={tz} onChange={(e) => setTz(e.target.value)} disabled={!canEdit}>
              {[...new Set([ws.timezone, ...COMMON_TIMEZONES])].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </GlassCard>
      <GlassCard>
        <CardTitle description="How long uploads are kept, and how AI providers are used.">Privacy & data</CardTitle>
        <div className="space-y-4">
          <Field label="Delete original documents after (days)" htmlFor="ret" hint="Extracted, reviewed facts are kept until you delete the document. Applies to existing documents too.">
            <Input id="ret" type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(Number(e.target.value))} disabled={!canEdit} className="w-32" />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-xl bg-black/20 p-4">
            <div>
              <p className="text-sm font-medium text-white">AI processing</p>
              <p className="mt-1 text-sm text-fog">
                Text you send to AI features goes to Groq or Google Gemini (per configuration). Documents are only ever processed by the configured document model and are never re-routed to another provider. Providers&apos; own data policies apply.
              </p>
            </div>
            <Switch checked={consent} onCheckedChange={setConsent} label="AI processing consent" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="glass">
              <a href="/api/v1/workspace/export" download>
                <Download /> Export workspace data (JSON)
              </a>
            </Button>
          </div>
        </div>
      </GlassCard>
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={save} loading={busy}>
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-sm text-stone">Only workspace admins can change these settings.</p>
      )}
    </div>
  );
}
