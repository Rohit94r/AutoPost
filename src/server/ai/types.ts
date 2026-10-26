export type ProviderId = "groq" | "gemini";

export type AITask = "draft" | "rewrite" | "adapt" | "hashtags" | "extract" | "critique" | "voice" | "reply";

export type MessagePart = { type: "text"; text: string } | { type: "file"; mimeType: string; data: Buffer };

export interface GenerateRequest {
  model: string;
  system: string;
  parts: MessagePart[];
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON Schema the response must follow (structured output where supported). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  signal: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  providerRequestId: string | null;
  finishReason: string | null;
}

/** Provider-independent contract. Business logic never sees provider request formats. */
export interface AIProvider {
  readonly id: ProviderId;
  readonly supportsFiles: boolean;
  isConfigured(): boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export type AIErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output"
  | "content_blocked"
  | "bad_request";

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly provider?: ProviderId,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** Map HTTP-ish failures from either SDK to our taxonomy. */
export function classifyProviderError(err: unknown, provider: ProviderId): AIError {
  if (err instanceof AIError) return err;
  const e = err as { status?: number; code?: string | number; name?: string; message?: string };
  const status = typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
  const message = String(e?.message ?? "Unknown provider error").slice(0, 300);
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || /timed? ?out|aborted/i.test(message)) {
    return new AIError("timeout", "The AI provider took too long to respond.", true, provider);
  }
  if (status === 429) return new AIError("rate_limited", "The AI provider is rate limiting requests.", true, provider, status);
  if (status === 401 || status === 403) return new AIError("not_configured", "The AI provider rejected the API key.", false, provider, status);
  if (status === 400 || status === 404 || status === 422) return new AIError("bad_request", `The AI provider rejected the request: ${message}`, false, provider, status);
  if (status && status >= 500) return new AIError("provider_error", "The AI provider had a temporary error.", true, provider, status);
  return new AIError("provider_error", message, status === undefined, provider, status);
}
