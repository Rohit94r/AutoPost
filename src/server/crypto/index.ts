import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/**
 * AES-256-GCM envelope: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 * keyId is a short hash of the key so ENCRYPTION_KEY_PREVIOUS can still decrypt during rotation.
 */
const VERSION = "v1";

function decodeKey(raw: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex)");
  return key;
}

const keyId = (key: Buffer) => createHash("sha256").update(key).digest("base64url").slice(0, 8);

function keys() {
  const e = env();
  const current = decodeKey(e.ENCRYPTION_KEY);
  const all = [current, ...(e.ENCRYPTION_KEY_PREVIOUS ? [decodeKey(e.ENCRYPTION_KEY_PREVIOUS)] : [])];
  return { current, byId: new Map(all.map((k) => [keyId(k), k])) };
}

export function encrypt(plaintext: string): string {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, keyId(current), iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(envelope: string): string {
  const [version, kid, iv, tag, ct] = envelope.split(".");
  if (version !== VERSION || !kid || !iv || !tag || ct === undefined) throw new Error("Malformed encrypted value");
  const key = keys().byId.get(kid);
  if (!key) throw new Error("No encryption key available for this value (was the key rotated out?)");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** HMAC signature for short-lived signed URLs (e.g. media Instagram must fetch). */
export function sign(value: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
