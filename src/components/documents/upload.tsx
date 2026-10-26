"use client";
import { FileUp, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function DocumentUpload({ maxMb, retentionDays, aiReady }: { maxMb: number; retentionDays: number; aiReady: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    if (!consent) return toast.error("Please confirm AI processing first.");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("consent", "true");
    try {
      const r = await api<{ document: { id: string } }>("/documents", { method: "POST", body: fd });
      toast.success("Uploaded. Extracting facts now.");
      router.push(`/documents/${r.document.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
      className={cn("rounded-2xl border border-dashed border-white/20 p-8 text-center transition", drag && "border-moss bg-moss/5")}
    >
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/8 text-moss">
        <FileUp className="size-6" />
      </div>
      <h3 className="mt-4 font-semibold text-white">Drop a certificate, letter, poster or summary</h3>
      <p className="mt-1 text-sm text-fog">PDF, JPEG, PNG or WebP · up to {maxMb} MB</p>
      <label className="mx-auto mt-5 flex max-w-lg cursor-pointer items-start gap-3 rounded-xl bg-black/25 p-3 text-left text-sm text-fog">
        <input type="checkbox" className="mt-1 size-4 accent-[#4ade80]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I agree that this document will be processed by <strong className="text-mist">Google Gemini</strong> to extract its text and facts. The original file is kept privately for{" "}
          {retentionDays} days, then deleted.
        </span>
      </label>
      <Button className="mt-5" onClick={() => input.current?.click()} loading={busy} disabled={!consent || !aiReady}>
        Choose a file
      </Button>
      {!aiReady && <p className="mt-2 text-xs text-sun">Document processing needs GEMINI_API_KEY on the server.</p>}
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-stone">
        <ShieldCheck className="size-3.5" /> Files are checked by content, not just extension. Instructions hidden inside documents are ignored.
      </p>
      <input ref={input} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
