import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/time";
import { PlatformError } from "@/server/platforms/types";
import { backoffDelayMs, decideOutcome, isSafeToRetry, MAX_DELAY_MS } from "@/server/publishing/retry";

const now = new Date("2026-10-26T10:00:00Z");
const fixed = () => 0.5;

describe("retry classification", () => {
  it("retries transient errors with backoff until max attempts", () => {
    const d = decideOutcome(new PlatformError("transient", "502"), 1, 5, now, fixed);
    expect(d.status).toBe("queued");
    if (d.status === "queued") expect(d.retryAt.getTime() - now.getTime()).toBe(60_000);
    expect(decideOutcome(new PlatformError("transient", "502"), 5, 5, now).status).toBe("failed");
  });
  it("honours Retry-After for rate limits", () => {
    const d = decideOutcome(new PlatformError("rate_limit", "429", { retryAfterSec: 900 }), 1, 5, now, fixed);
    expect(d.status === "queued" && d.retryAt.getTime() - now.getTime()).toBe(900_000);
  });
  it("never retries permanent errors", () => {
    for (const kind of ["validation", "permission", "media"] as const) {
      const d = decideOutcome(new PlatformError(kind, "x"), 1, 5, now);
      expect(d).toMatchObject({ status: "failed", attemptOutcome: "permanent_error" });
    }
  });
  it("auth errors park the job for reconnection", () => {
    expect(decideOutcome(new PlatformError("auth", "expired"), 1, 5, now).status).toBe("needs_reconnection");
  });
  it("ambiguous outcomes fail without retry and require confirmation", () => {
    const d = decideOutcome(new PlatformError("ambiguous", "timeout during create"), 1, 5, now);
    expect(d).toMatchObject({ status: "failed", code: "ambiguous" });
    expect(isSafeToRetry("ambiguous")).toBe(false);
    expect(isSafeToRetry("interrupted")).toBe(false);
    expect(isSafeToRetry("transient")).toBe(true);
  });
  it("caps backoff growth", () => {
    expect(backoffDelayMs(20, undefined, fixed)).toBeLessThanOrEqual(MAX_DELAY_MS * 1.5);
    expect(backoffDelayMs(2, undefined, fixed)).toBe(120_000);
  });
});

describe("time zones", () => {
  it("converts local wall time to UTC", () => {
    expect(zonedLocalToUtc("2026-11-02T09:30", "Asia/Kolkata").toISOString()).toBe("2026-11-02T04:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
  it("handles DST transitions in America/New_York", () => {
    // Before and after the 2026-11-01 fall-back.
    expect(zonedLocalToUtc("2026-10-31T12:00", "America/New_York").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(zonedLocalToUtc("2026-11-02T12:00", "America/New_York").toISOString()).toBe("2026-11-02T17:00:00.000Z");
  });
  it("round-trips", () => {
    const d = zonedLocalToUtc("2026-12-24T18:45", "Australia/Sydney");
    expect(utcToZonedLocal(d, "Australia/Sydney")).toBe("2026-12-24T18:45");
  });
  it("rejects bad input", () => {
    expect(() => zonedLocalToUtc("tomorrow", "UTC")).toThrow();
    expect(() => zonedLocalToUtc("2026-11-02T09:30", "Mars/Olympus")).toThrow();
  });
});
