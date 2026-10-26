import "server-only";
import { PlatformError } from "./types";

/**
 * Outbound HTTP for platform APIs. Only HTTPS requests to allow-listed platform hosts are
 * permitted (SSRF defence: upload URLs returned by platforms are validated too).
 */
const ALLOWED_SUFFIXES = [".linkedin.com", ".licdn.com", ".instagram.com", ".facebook.com", ".x.com", ".twitter.com"];
const ALLOWED_EXACT = new Set(["linkedin.com", "x.com", "api.x.com", "graph.instagram.com", "api.instagram.com"]);

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

export type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl = (...args) => fetch(...args);
export const setPlatformFetchForTesting = (f: FetchImpl | undefined) => {
  fetchImpl = f ?? ((...args) => fetch(...args));
};

export interface CallOptions {
  timeoutMs?: number;
  /** Mark network failures as ambiguous (used for the final create-post call). */
  ambiguous?: boolean;
}

export async function platformFetch(url: string, init: RequestInit, opts: CallOptions = {}): Promise<Response> {
  assertAllowedUrl(url);
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
  const reset = res.headers.get("x-rate-limit-reset");
  if (reset && /^\d+$/.test(reset)) return Math.max(1, Number(reset) - Math.floor(Date.now() / 1000));
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
