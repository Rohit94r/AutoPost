"use client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";

/** Retry only this post's safely-retryable failed destinations (never the published ones). */
export function RetryFailed({ contentId }: { contentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="glass"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ retried: string[]; needsConfirmation: string[] }>(`/content/${contentId}/retry-failed`, { method: "POST" });
          toast.success(r.retried.length ? `Retrying ${r.retried.length} destination(s)` : "Nothing safe to retry automatically");
          if (r.needsConfirmation.length) toast.message(`${r.needsConfirmation.length} destination(s) need you to check the platform first. Use Retry on each.`);
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <RotateCcw /> Retry failed destinations
    </Button>
  );
}
