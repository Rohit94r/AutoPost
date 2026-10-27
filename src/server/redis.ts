import "server-only";
import IORedis, { type Redis } from "ioredis";
import { env } from "@/server/env";

const g = globalThis as unknown as { __flowtRedis?: Redis | null };

/** Shared Redis connection (BullMQ requires maxRetriesPerRequest: null). Null when REDIS_URL is unset. */
export function getRedis(): Redis | null {
  if (g.__flowtRedis !== undefined) return g.__flowtRedis;
  const url = env().REDIS_URL;
  g.__flowtRedis = url ? new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false }) : null;
  return g.__flowtRedis;
}

export function newRedisConnection(): Redis {
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the worker");
  return new IORedis(url, { maxRetriesPerRequest: null });
}
