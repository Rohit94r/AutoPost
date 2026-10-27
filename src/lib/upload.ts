import { api } from "./api-client";

/**
 * Upload a file as media or a document. With cloud storage the browser sends the file straight
 * to the bucket (no app-server size limit), then the server validates it; otherwise it's posted
 * to the app as a form.
 */
export async function uploadFile<T>(file: File, purpose: "media" | "document", extra: { altText?: string; consent?: boolean } = {}): Promise<T> {
  const contentType = file.type || "application/octet-stream";
  const start = await api<{ direct: true; key: string; uploadUrl: string } | { direct: false }>("/uploads", { method: "POST", json: { purpose, filename: file.name, contentType, size: file.size } });
  if (!start.direct) {
    const fd = new FormData();
    fd.append("file", file);
    if (extra.altText) fd.append("altText", extra.altText);
    if (extra.consent) fd.append("consent", "true");
    return api<T>(purpose === "media" ? "/media" : "/documents", { method: "POST", body: fd });
  }
  const put = await fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file }).catch(() => null);
  if (!put?.ok) throw new Error(`Couldn't send the file to storage${put ? ` (HTTP ${put.status})` : ""}. The bucket may need a CORS rule for this site.`);
  return api<T>("/uploads/complete", { method: "POST", json: { purpose, key: start.key, filename: file.name, contentType, ...extra } });
}
