import { PlatformError } from "@/server/platforms/types";

/**
 * Retry policy (pure; unit-tested). Decides what happens to a publishing job after an error:
 * - transient / rate_limit → retry with bounded exponential backoff (honouring Retry-After)
 * - auth → needs_reconnection (no retry until the user reconnects)
 * - permission / validation / media → permanent failure
 * - ambiguous / unknown-after-create → failed, never auto-retried (could duplicate a post)
 */
export const BASE_DELAY_MS = 60_000;
export const MAX_DELAY_MS = 60 * 60_000;

export function backoffDelayMs(attempt: number, retryAfterSec?: number, random = Math.random): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * (0.8 + random() * 0.4);
  const floor = retryAfterSec ? retryAfterSec * 1000 : 0;
  return Math.round(Math.min(MAX_DELAY_MS * 1.5, Math.max(jitter, floor)));
}

export type JobOutcome =
  | { status: "queued"; attemptOutcome: "retryable_error"; retryAt: Date; code: string; message: string }
  | { status: "failed"; attemptOutcome: "permanent_error" | "retryable_error" | "interrupted"; code: string; message: string }
  | { status: "needs_reconnection"; attemptOutcome: "auth_error"; code: string; message: string };

export function decideOutcome(err: unknown, attemptCount: number, maxAttempts: number, now = new Date(), random = Math.random): JobOutcome {
  const pe =
    err instanceof PlatformError
      ? err
      : new PlatformError("transient", err instanceof Error ? err.message.slice(0, 300) : "Unexpected error while publishing.");
  switch (pe.kind) {
    case "auth":
      return { status: "needs_reconnection", attemptOutcome: "auth_error", code: "auth", message: pe.message };
    case "permission":
    case "validation":
    case "media":
    case "not_configured":
      return { status: "failed", attemptOutcome: "permanent_error", code: pe.kind, message: pe.message };
    case "ambiguous":
      return { status: "failed", attemptOutcome: "interrupted", code: "ambiguous", message: pe.message };
    case "rate_limit":
    case "transient": {
      if (attemptCount >= maxAttempts) {
        return { status: "failed", attemptOutcome: "retryable_error", code: pe.kind, message: `${pe.message} Gave up after ${attemptCount} attempts.` };
      }
      const delay = backoffDelayMs(attemptCount, pe.opts.retryAfterSec, random);
      return { status: "queued", attemptOutcome: "retryable_error", retryAt: new Date(now.getTime() + delay), code: pe.kind, message: pe.message };
    }
  }
}

/** Retrying is safe only when we know the platform did not create the post. */
export function isSafeToRetry(lastErrorCode: string | null) {
  return lastErrorCode !== "ambiguous" && lastErrorCode !== "interrupted";
}
