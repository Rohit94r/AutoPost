import "server-only";
import { tooManyRequests } from "@/server/errors";
import { logger } from "@/server/logger";
import { getRedis } from "@/server/redis";

export interface RateLimitRule {
  /** Logical bucket, e.g. "ai" or "upload". */
  bucket: string;
  limit: number;
  windowSec: number;
}

export const RATE_LIMITS = {
  default: { bucket: "api", limit: 120, windowSec: 60 },
  ai: { bucket: "ai", limit: 20, windowSec: 60 },
  upload: { bucket: "upload", limit: 20, windowSec: 60 },
  publish: { bucket: "publish", limit: 30, windowSec: 60 },
  oauth: { bucket: "oauth", limit: 10, windowSec: 60 },
} satisfies Record<string, RateLimitRule>;

const memory = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window counter. Uses Redis when available (shared across instances), memory otherwise. */
export async function hit(rule: RateLimitRule, subject: string, now = Date.now()) {
  const window = Math.floor(now / (rule.windowSec * 1000));
  const key = `rl:${rule.bucket}:${subject}:${window}`;
  const resetAt = (window + 1) * rule.windowSec * 1000;
  let count: number;
  const redis = getRedis();
  if (redis) {
    try {
      const res = await redis.multi().incr(key).expire(key, rule.windowSec + 1).exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch (err) {
      logger.warn({ err }, "rate limiter redis error; falling back to memory");
      count = memoryHit(key, resetAt);
    }
  } else {
    count = memoryHit(key, resetAt);
  }
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt };
}

function memoryHit(key: string, resetAt: number) {
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    memory.set(key, { count: 1, resetAt });
    if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt <= Date.now()) memory.delete(k);
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export async function enforceRateLimit(rule: RateLimitRule, subject: string) {
  const r = await hit(rule, subject);
  if (!r.allowed) throw tooManyRequests(Math.ceil((r.resetAt - Date.now()) / 1000));
  return r;
}
