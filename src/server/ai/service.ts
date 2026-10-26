import "server-only";
import type { z } from "zod";
import { db } from "@/server/db";
import { aiGenerations } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertQuota, recordUsage } from "@/server/usage/service";
import { getRegistry, type ModelRoute } from "./registry";
import { jsonSchemaFor } from "./schemas";
import { AIError, type AITask, type GenerateResult, type MessagePart } from "./types";

export interface RunTaskInput<T> {
  task: AITask;
  workspaceId: string;
  userId?: string | null;
  correlationId: string;
  system: string;
  parts: MessagePart[];
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxOutputTokens?: number;
  contentId?: string | null;
  documentId?: string | null;
  /** Skip quota check (already enforced by the caller, e.g. document quota). */
  skipQuota?: boolean;
}

export interface RunTaskResult<T> {
  data: T;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AIError("invalid_output", "The AI response was not valid JSON.", true);
  }
}

/** Calls one route with per-attempt timeout and bounded exponential backoff for retryable errors. */
async function callWithRetries(route: ModelRoute, input: RunTaskInput<unknown>, parts: MessagePart[]): Promise<GenerateResult> {
  const provider = getRegistry().provider(route.provider);
  const { AI_TIMEOUT_MS, AI_MAX_RETRIES } = env();
  let lastErr: AIError | undefined;
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      return await provider.generate({
        model: route.model,
        system: input.system,
        parts,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        jsonSchema: jsonSchemaFor(input.schemaName, input.schema),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err instanceof AIError ? err : new AIError("provider_error", String(err), true, route.provider);
      if (!lastErr.retryable || attempt === AI_MAX_RETRIES) break;
      await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250);
    }
  }
  throw lastErr ?? new AIError("provider_error", "AI request failed", false);
}

/**
 * Runs an AI task end-to-end: quota → route → call (retries) → JSON parse → schema validation
 * (one repair attempt) → optional configured fallback → usage + generation log.
 * The caller's original content is never modified here; failures surface as AppErrors.
 */
export async function runTask<T>(input: RunTaskInput<T>): Promise<RunTaskResult<T>> {
  if (!input.skipQuota) await assertQuota(input.workspaceId, "ai");
  const needsFiles = input.parts.some((p) => p.type === "file");
  const registry = getRegistry();
  let route: ModelRoute;
  try {
    route = registry.resolve(input.task, { needsFiles });
  } catch (err) {
    throw toAppError(err);
  }

  const started = Date.now();
  const routes = [route, registry.fallbackRoute(input.task, route, { needsFiles })].filter(Boolean) as ModelRoute[];
  let lastErr: unknown;

  for (const r of routes) {
    let totalIn = 0;
    let totalOut = 0;
    let requestId: string | null = null;
    try {
      let parts = input.parts;
      for (let repair = 0; repair < 2; repair++) {
        const res = await callWithRetries(r, input as RunTaskInput<unknown>, parts);
        totalIn += res.inputTokens ?? 0;
        totalOut += res.outputTokens ?? 0;
        requestId = res.providerRequestId;
        let parsed: z.ZodSafeParseResult<T>;
        try {
          parsed = input.schema.safeParse(parseJsonLoose(res.text));
        } catch {
          parsed = { success: false } as z.ZodSafeParseResult<T>;
        }
        if (parsed.success) {
          await logGeneration(input, r, "succeeded", { totalIn, totalOut, requestId, latency: Date.now() - started });
          return { data: parsed.data, provider: r.provider, model: res.model, inputTokens: totalIn || null, outputTokens: totalOut || null };
        }
        parts = [
          ...input.parts,
          { type: "text", text: `Your previous answer did not match the required JSON schema. Return ONLY valid JSON for schema "${input.schemaName}".` },
        ];
      }
      throw new AIError("invalid_output", "The AI returned output in an unexpected format.", false, r.provider);
    } catch (err) {
      lastErr = err;
      const e = err instanceof AIError ? err : new AIError("provider_error", String(err), false, r.provider);
      await logGeneration(input, r, "failed", { totalIn, totalOut, requestId, latency: Date.now() - started, error: e });
      logger.warn({ correlationId: input.correlationId, task: input.task, provider: r.provider, code: e.code }, "AI task attempt failed");
    }
  }
  throw toAppError(lastErr);
}

async function logGeneration(
  input: RunTaskInput<unknown>,
  route: ModelRoute,
  status: "succeeded" | "failed",
  m: { totalIn: number; totalOut: number; requestId: string | null; latency: number; error?: AIError },
) {
  try {
    await db.insert(aiGenerations).values({
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      task: input.task,
      provider: route.provider,
      model: route.model,
      status,
      inputTokens: m.totalIn || null,
      outputTokens: m.totalOut || null,
      latencyMs: m.latency,
      providerRequestId: m.requestId,
      errorCode: m.error?.code ?? null,
      errorMessage: m.error?.message.slice(0, 500) ?? null,
      correlationId: input.correlationId,
      contentId: input.contentId ?? null,
      documentId: input.documentId ?? null,
    });
    if (status === "succeeded") {
      await recordUsage({ workspaceId: input.workspaceId, userId: input.userId, metric: "ai_request", quantity: 1, metadata: { task: input.task, provider: route.provider } });
      await recordUsage({ workspaceId: input.workspaceId, userId: input.userId, metric: "ai_tokens", quantity: m.totalIn + m.totalOut });
    }
  } catch (err) {
    logger.error({ err }, "failed to record AI generation");
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof AIError) {
    const status = { not_configured: 503, timeout: 504, rate_limited: 429, provider_error: 502, invalid_output: 502, content_blocked: 422, bad_request: 400 }[err.code];
    const prefix = err.provider ? `${err.provider === "groq" ? "Groq" : "Gemini"}: ` : "";
    return new AppError(status, `ai_${err.code}`, `${prefix}${err.message} Your original content has not been changed.`);
  }
  return new AppError(502, "ai_provider_error", "AI generation failed. Your original content has not been changed.");
}
