import { api } from "./api-client";

type Start =
  | { mode: "direct"; key: string; uploadUrl: string }
  | { mode: "chunked"; key: string; chunkSize: number }
  | { mode: "form" };

/**
 * Upload a file as media or a document, in whichever way the server's storage needs:
 * straight to the bucket (S3/R2), in parts through the app (database storage, keeps every request
 * under Vercel's size limit) or as a normal form (local disk). The server validates it in every case.
 */
export async function uploadFile<T>(file: File, purpose: "media" | "document", extra: { altText?: string; consent?: boolean } = {}, onProgress?: (fraction: number) => void): Promise<T> {
  const contentType = file.type || "application/octet-stream";
  const start = await api<Start>("/uploads", { method: "POST", json: { purpose, filename: file.name, contentType, size: file.size } });
  if (start.mode === "form") {
    const fd = new FormData();
    fd.append("file", file);
    if (extra.altText) fd.append("altText", extra.altText);
    if (extra.consent) fd.append("consent", "true");
    return api<T>(purpose === "media" ? "/media" : "/documents", { method: "POST", body: fd });
  }
  if (start.mode === "direct") {
    const put = await fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file }).catch(() => null);
    if (!put?.ok) throw new Error(`Couldn't send the file to storage${put ? ` (HTTP ${put.status})` : ""}. The bucket may need a CORS rule for this site.`);
  } else {
    const parts = Math.ceil(file.size / start.chunkSize);
    for (let i = 0; i < parts; i++) {
      const body = file.slice(i * start.chunkSize, (i + 1) * start.chunkSize);
      await api(`/uploads/chunk?key=${encodeURIComponent(start.key)}&index=${i}`, { method: "POST", body, headers: { "Content-Type": "application/octet-stream" } });
      onProgress?.((i + 1) / parts);
    }
  }
  return api<T>("/uploads/complete", { method: "POST", json: { purpose, key: start.key, filename: file.name, contentType, ...extra } });
}
