import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentReview } from "@/components/documents/review";
import { PageHeader } from "@/components/ui/misc";
import { requirePageContext } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";

export const metadata = { title: "Review document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await getDocument(ctx.workspace.id, id).catch(() => null);
  if (!doc) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Document"
        title={doc.originalFilename}
        description={
          <>
            Processed by {doc.aiProvider === "gemini" ? "Google Gemini" : doc.aiProvider ?? "the configured AI provider"} with your consent.{" "}
            <Link href="/documents" className="text-moss hover:underline">
              All documents
            </Link>
          </>
        }
      />
      <DocumentReview
        key={`${doc.status}:${doc.extraction?.id ?? "none"}:${doc.extraction?.reviewedAt?.toISOString() ?? ""}`}
        doc={{
          id: doc.id,
          originalFilename: doc.originalFilename,
          mimeType: doc.mimeType,
          status: doc.status,
          error: doc.error,
          previewUrl: doc.previewUrl,
          aiProvider: doc.aiProvider,
          extraction: doc.extraction
            ? {
                documentType: doc.extraction.documentType,
                method: doc.extraction.method,
                summary: doc.extraction.summary,
                extractedText: doc.extraction.extractedText,
                fields: doc.extraction.fields,
                missingFields: doc.extraction.missingFields,
                warnings: doc.extraction.warnings,
                reviewedFields: doc.extraction.reviewedFields,
                userClaims: doc.extraction.userClaims,
                model: doc.extraction.model,
              }
            : null,
        }}
      />
    </>
  );
}
