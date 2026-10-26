import "server-only";
import IORedis, { type Redis } from "ioredis";
import { env } from "@/server/env";

const g = globalThis as unknown as { __verdantRedis?: Redis | null };

/** Shared Redis connection (BullMQ requires maxRetriesPerRequest: null). Null when REDIS_URL is unset. */
export function getRedis(): Redis | null {
  if (g.__verdantRedis !== undefined) return g.__verdantRedis;
  const url = env().REDIS_URL;
  g.__verdantRedis = url ? new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false }) : null;
  return g.__verdantRedis;
}

export function newRedisConnection(): Redis {
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the worker");
  return new IORedis(url, { maxRetriesPerRequest: null });
}
