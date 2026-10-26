"use client";
import { ArchiveRestore, Copy, MoreHorizontal, PenSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu as DM } from "radix-ui";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";

const item = "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-fog outline-none data-highlighted:bg-white/10 data-highlighted:text-white [&_svg]:size-4";

export function ContentActions({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <DM.Root>
      <DM.Trigger className="rounded-lg p-1.5 text-fog hover:bg-white/10 hover:text-white" aria-label="Post actions">
        <MoreHorizontal className="size-4" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" className="glass-strong z-50 min-w-44 rounded-xl! p-1.5">
          <DM.Item asChild className={item}>
            <Link href={`/compose?id=${id}`}>
              <PenSquare /> Open
            </Link>
          </DM.Item>
          <DM.Item
            className={item}
            onSelect={() =>
              run(async () => {
                const r = await api<{ content: { id: string } }>(`/content/${id}/duplicate`, { method: "POST" });
                router.push(`/compose?id=${r.content.id}`);
              }, "Duplicated as a new draft")
            }
          >
            <Copy /> Duplicate as draft
          </DM.Item>
          {archived ? (
            <DM.Item className={item} onSelect={() => run(() => api(`/content/${id}/unarchive`, { method: "POST" }), "Restored")}>
              <ArchiveRestore /> Restore
            </DM.Item>
          ) : (
            <DM.Item
              className={item}
              onSelect={() =>
                run(async () => {
                  const r = await api<{ deleted: boolean }>(`/content/${id}`, { method: "DELETE" });
                  if (!r.deleted) toast.message("Posts with publishing history are archived, not deleted.");
                }, "Done")
              }
            >
              <Trash2 /> Delete / archive
            </DM.Item>
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function MediaActions({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="rounded-md bg-black/60 p-1.5 text-white hover:bg-red-500/80"
      aria-label="Delete media"
      onClick={async () => {
        if (!confirm("Delete this file?")) return;
        try {
          await api(`/media/${id}`, { method: "DELETE" });
          toast.success("Deleted");
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

