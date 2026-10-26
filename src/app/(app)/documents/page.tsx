import { FileText, ImageIcon } from "lucide-react";
import Link from "next/link";
import { DocumentUpload } from "@/components/documents/upload";
import { CardTitle, EmptyState, GlassCard, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/platform";
import { formatBytes, timeAgo } from "@/lib/utils";
import { requirePageContext } from "@/server/auth/session";
import { listDocuments } from "@/server/documents/service";
import { env, integrationStatus } from "@/server/env";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const ctx = await requirePageContext();
  const docs = await listDocuments(ctx.workspace.id);
  const e = env();
  const i = integrationStatus();
  return (
    <>
      <PageHeader eyebrow="Document intelligence" title="Turn documents into posts" description="Upload, check the extracted facts, then generate accurate drafts. Nothing is added that the document or you didn't say." />
      <GlassCard className="mb-4">
        <DocumentUpload maxMb={e.DOCUMENT_MAX_MB} retentionDays={ctx.workspace.documentRetentionDays} aiReady={i.gemini || Boolean(e.AI_MODEL_EXTRACT)} />
      </GlassCard>
      <GlassCard>
        <CardTitle>Your documents</CardTitle>
        {docs.length === 0 ? (
          <EmptyState icon={<FileText />} title="No documents yet" description="Try a certificate or event poster to see what Verdant extracts." />
        ) : (
          <ul className="divide-y divide-white/6">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className="flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-white/5">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/8 text-fog">{d.mimeType === "application/pdf" ? <FileText className="size-5" /> : <ImageIcon className="size-5" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{d.originalFilename}</p>
                    <p className="text-xs text-stone">
                      {formatBytes(d.sizeBytes)} · uploaded {timeAgo(d.createdAt)}
                      {!d.hasFile && " · original file deleted (retention)"}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </>
  );
}
