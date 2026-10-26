import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { PlatformError } from "./types";

/**
 * Outbound HTTP for platform APIs (SSRF defence):
 * - fixed platform APIs: HTTPS + allow-listed hosts only;
 * - user-supplied hosts (Mastodon instance, WordPress site, custom webhook, Bluesky PDS):
 *   HTTPS only, and every resolved address must be public (no loopback/private/link-local).
 * Redirects are never followed.
 */
const ALLOWED_SUFFIXES = [
  ".linkedin.com",
  ".licdn.com",
  ".instagram.com",
  ".facebook.com",
  ".x.com",
  ".twitter.com",
  ".threads.net",
  ".threads.com",
  ".googleapis.com",
  ".google.com",
  ".tiktokapis.com",
  ".tiktok.com",
  ".pinterest.com",
  ".reddit.com",
  ".bsky.social",
  ".bsky.app",
  ".telegram.org",
  ".discord.com",
  ".discordapp.com",
];
const ALLOWED_EXACT = new Set([
  "linkedin.com",
  "x.com",
  "api.x.com",
  "graph.instagram.com",
  "api.instagram.com",
  "graph.facebook.com",
  "graph.threads.net",
  "graph.threads.com",
  "threads.com",
  "threads.net",
  "bsky.social",
  "discord.com",
  "api.telegram.org",
]);

export function assertAllowedUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PlatformError("validation", "Invalid platform URL");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(ALLOWED_EXACT.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s)))) {
    throw new PlatformError("validation", `Refusing to call non-platform host: ${host}`);
  }
  return url;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = address.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
  }
  return true;
}

type Lookup = (host: string) => Promise<{ address: string }[]>;
let dnsLookup: Lookup = (host) => lookup(host, { all: true });
export const setDnsLookupForTesting = (fn: Lookup | undefined) => {
  dnsLookup = fn ?? ((host) => lookup(host, { all: true }));
};

/** Validates a user-supplied URL: HTTPS, and it must resolve only to public addresses. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PlatformError("validation", "That URL isn't valid.");
  }
  if (url.protocol !== "https:") throw new PlatformError("validation", "Only https:// URLs are allowed.");
  if (url.username || url.password) throw new PlatformError("validation", "URLs with embedded credentials aren't allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PlatformError("validation", "Private or local addresses aren't allowed.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await dnsLookup(host).catch(() => []);
  if (!addresses.length) throw new PlatformError("validation", `Couldn't resolve ${host}.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new PlatformError("validation", "Private or local addresses aren't allowed.");
  return url;
}

export type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl = (...args) => fetch(...args);
export const setPlatformFetchForTesting = (f: FetchImpl | undefined) => {
  fetchImpl = f ?? ((...args) => fetch(...args));
};

export interface CallOptions {
  timeoutMs?: number;
  /** Mark network failures as ambiguous (used for the final create-post call). */
  ambiguous?: boolean;
  /** The host was supplied by the user: validate it resolves to a public address instead of the allow-list. */
  userHost?: boolean;
}

export async function platformFetch(url: string, init: RequestInit, opts: CallOptions = {}): Promise<Response> {
  if (opts.userHost) await assertPublicHttpsUrl(url);
  else assertAllowedUrl(url);
  try {
    return await fetchImpl(url, { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
  } catch (err) {
    if (err instanceof PlatformError) throw err;
    const msg = (err as Error)?.name === "TimeoutError" ? "The platform did not respond in time." : "Could not reach the platform.";
    if (opts.ambiguous) {
      throw new PlatformError("ambiguous", `${msg} The post may or may not have been created. Check your profile before retrying.`);
    }
    throw new PlatformError("transient", msg);
  }
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

export function retryAfterFrom(res: Response, fallbackSec = 60): number {
  const ra = res.headers.get("retry-after");
  if (ra && /^\d+$/.test(ra)) return Number(ra);
  const reset = res.headers.get("x-rate-limit-reset") ?? res.headers.get("x-ratelimit-reset");
  if (reset && /^\d+(\.\d+)?$/.test(reset)) {
    const n = Number(reset);
    // Some APIs send an epoch timestamp, others a number of seconds until reset.
    return Math.max(1, Math.ceil(n > 1e9 ? n - Date.now() / 1000 : n));
  }
  return fallbackSec;
}

/** Generic status → error kind mapping; adapters refine with platform-specific error codes. */
export function errorFromStatus(status: number, message: string, res?: Response, requestId?: string | null): PlatformError {
  if (status === 401) return new PlatformError("auth", message || "The connection expired or was revoked. Reconnect the account.", { status, requestId });
  if (status === 403) return new PlatformError("permission", message || "The platform denied permission for this action.", { status, requestId });
  if (status === 429) return new PlatformError("rate_limit", message || "Rate limited by the platform.", { status, retryAfterSec: res ? retryAfterFrom(res) : 60, requestId });
  if (status >= 500) return new PlatformError("transient", message || "The platform had a temporary error.", { status, requestId });
  return new PlatformError("validation", message || "The platform rejected the request.", { status, requestId });
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new PlatformError("transient", "Operation aborted (worker shutting down)."));
    });
  });

export const expiresAtFrom = (expiresIn: unknown) =>
  typeof expiresIn === "number" && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

/** Throws a PlatformError built from a JSON error body (generic shape used by several adapters). */
export async function failGeneric(res: Response, label: string): Promise<never> {
  const body = (await readJson(res)) as { error?: unknown; message?: string; error_description?: string; detail?: string; errors?: { message?: string }[] };
  const e = body.error;
  const msg =
    (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : typeof e === "string" ? e : undefined) ??
    body.error_description ??
    body.message ??
    body.detail ??
    body.errors?.[0]?.message ??
    "";
  throw errorFromStatus(res.status, msg ? `${label}: ${String(msg).slice(0, 300)}` : "", res);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
