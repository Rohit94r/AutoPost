import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface MetaSignedRequest {
  algorithm: string;
  issued_at?: number;
  user_id?: string;
  [key: string]: unknown;
}

/**
 * Verifies a Meta `signed_request` (deauthorize / data-deletion callbacks):
 * `<base64url HMAC-SHA256(payload, app_secret)>.<base64url JSON payload>`.
 * Returns the payload, or null when the signature or format is invalid.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): MetaSignedRequest | null {
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) return null;
  let data: MetaSignedRequest;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data?.algorithm !== "string" || data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(encodedSig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return data;
}

/** Test helper / documentation of the format. */
export function createSignedRequest(data: Record<string, unknown>, appSecret: string): string {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...data })).toString("base64url");
  const sig = createHmac("sha256", appSecret).update(payload).digest("base64url");
  return `${sig}.${payload}`;
}
