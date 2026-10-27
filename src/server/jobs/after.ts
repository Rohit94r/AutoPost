import "server-only";
import { after } from "next/server";
import { logger } from "@/server/logger";

/**
 * Run `fn` after the current response is sent (Vercel keeps the function alive for it, up to the
 * route's maxDuration). Returns false outside a request (scripts, tests) so callers can fall back.
 */
export function runAfterResponse(label: string, fn: () => Promise<unknown>): boolean {
  try {
    after(async () => {
      try {
        await fn();
      } catch (err) {
        logger.error({ err, task: label }, "background task failed");
      }
    });
    return true;
  } catch {
    return false;
  }
}
