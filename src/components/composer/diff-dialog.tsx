"use client";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { wordDiff } from "@/lib/diff";
import type { ValidationIssue } from "@/lib/platforms";

export interface RewriteResult {
  before: string;
  after: string;
  changes: string[];
  issues: ValidationIssue[];
  provider: string;
  model: string;
}

/** Before/after comparison; nothing replaces the user's text until they accept. */
export function DiffDialog({ result, onAccept, onClose }: { result: RewriteResult | null; onAccept: (text: string) => void; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(result)}
      onOpenChange={(o) => !o && onClose()}
      title="Review the rewrite"
      description={result ? `Generated with ${result.provider === "groq" ? "Groq" : "Gemini"} · ${result.model}. Removed text is struck through, new text is highlighted.` : undefined}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep original
          </Button>
          <Button onClick={() => result && onAccept(result.after)}>Use rewrite</Button>
        </>
      }
    >
      {result && (
        <div className="space-y-4">
          <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-relaxed">
            {wordDiff(result.before, result.after).map((p, i) =>
              p.type === "same" ? (
                <span key={i} className="text-mist">
                  {p.text}
                </span>
              ) : p.type === "added" ? (
                <ins key={i} className="rounded bg-emerald-400/20 text-emerald-100 no-underline">
                  {p.text}
                </ins>
              ) : (
                <del key={i} className="text-red-300/70">
                  {p.text}
                </del>
              ),
            )}
          </div>
          {result.changes.length > 0 && (
            <ul className="list-inside list-disc text-sm text-fog">
              {result.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {result.issues.length > 0 && (
            <Notice tone="warn" title="Check before using">
              {result.issues.map((i) => i.message).join(" ")}
            </Notice>
          )}
        </div>
      )}
    </Dialog>
  );
}
