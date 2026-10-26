"use client";
import { ArrowLeft, FileText, ImageIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DocumentReview, type Fact } from "@/components/documents/review";
import { DocumentUpload } from "@/components/documents/upload";
import { Spinner } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/platform";
import { api, errorMessage } from "@/lib/api-client";
import { formatBytes, timeAgo } from "@/lib/utils";

interface DocListItem {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  hasFile: boolean;
  createdAt: string;
}

interface DocDetail {
  id: string;
  originalFilename: string;
  mimeType: string;
  status: string;
  error: string | null;
  previewUrl: string | null;
  aiProvider: string | null;
  extraction: {
    id: string;
    documentType: string;
    method: string;
    summary: string | null;
    extractedText: string;
    fields: Fact[];
    missingFields: string[];
    warnings: string[];
    reviewedFields: Fact[] | null;
    userClaims: string | null;
    model: string | null;
    reviewedAt: string | null;
  } | null;
}

/**
 * "Start from a document" inside Create post: upload a certificate/letter/poster, check the facts
 * Gemini extracted, then generate platform drafts from them. Earlier documents can be reopened.
 */
export function DocumentImport({ initialId, maxMb, retentionDays, aiReady }: { initialId: string | null; maxMb: number; retentionDays: number; aiReady: boolean }) {
  const [docs, setDocs] = useState<DocListItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [doc, setDoc] = useState<DocDetail | null>(null);

  const loadDoc = useCallback(() => {
    if (!activeId) return;
    api<{ document: DocDetail }>(`/documents/${activeId}`)
      .then((r) => setDoc(r.document))
      .catch((err) => {
        toast.error(errorMessage(err));
        setActiveId(null);
      });
  }, [activeId]);

  useEffect(() => {
    let alive = true;
    if (activeId) {
      api<{ document: DocDetail }>(`/documents/${activeId}`)
        .then((r) => alive && setDoc(r.document))
        .catch((err) => {
          if (!alive) return;
          toast.error(errorMessage(err));
          setActiveId(null);
        });
    } else {
      api<{ documents: DocListItem[] }>("/documents")
        .then((r) => alive && setDocs(r.documents))
        .catch((err) => alive && toast.error(errorMessage(err)));
    }
    return () => {
      alive = false;
    };
  }, [activeId]);

  // Leaving a document reloads the list (the effect runs again when activeId clears).
  const back = () => {
    setActiveId(null);
    setDoc(null);
    setDocs(null);
  };

  if (activeId) {
    if (!doc || doc.id !== activeId)
      return (
        <div className="grid place-items-center py-16">
          <Spinner className="size-6 text-moss" />
        </div>
      );
    return (
      <div>
        <button onClick={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-moss hover:underline">
          <ArrowLeft className="size-4" /> Other documents
        </button>
        <DocumentReview
          key={`${doc.status}:${doc.extraction?.id ?? "none"}:${doc.extraction?.reviewedAt ?? ""}`}
          doc={doc}
          onRefresh={loadDoc}
          onDeleted={() => {
            toast.success("Document deleted");
            back();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DocumentUpload maxMb={maxMb} retentionDays={retentionDays} aiReady={aiReady} onUploaded={setActiveId} />
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-stone">Your documents</p>
        {docs === null ? (
          <Spinner className="size-5 text-moss" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-fog">No documents yet. Try a certificate or event poster.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-white/6 overflow-y-auto">
            {docs.map((d) => (
              <li key={d.id}>
                <button onClick={() => setActiveId(d.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/5">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/8 text-fog">{d.mimeType === "application/pdf" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{d.originalFilename}</span>
                    <span className="block text-xs text-stone">
                      {formatBytes(d.sizeBytes)} · {timeAgo(d.createdAt)}
                      {!d.hasFile && " · original deleted (retention)"}
                    </span>
                  </span>
                  <StatusBadge status={d.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
