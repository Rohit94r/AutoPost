import "server-only";
import Groq from "groq-sdk";
import { env } from "@/server/env";
import { AIError, classifyProviderError, type AIProvider, type GenerateRequest, type GenerateResult } from "../types";

/** GroqProvider — fast text generation via the official groq-sdk (OpenAI-compatible chat API). */
export class GroqProvider implements AIProvider {
  readonly id = "groq" as const;
  readonly supportsFiles = false;
  private client: Groq | undefined;

  constructor(private readonly apiKey = env().GROQ_API_KEY) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private sdk() {
    if (!this.apiKey) throw new AIError("not_configured", "GROQ_API_KEY is not set.", false, "groq");
    this.client ??= new Groq({ apiKey: this.apiKey, maxRetries: 0, timeout: env().AI_TIMEOUT_MS });
    return this.client;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.parts.some((p) => p.type === "file")) {
      throw new AIError("bad_request", "Groq models configured here do not accept file input.", false, "groq");
    }
    const userText = req.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n\n");
    const isGptOss = req.model.startsWith("openai/gpt-oss");
    const responseFormat = req.jsonSchema
      ? isGptOss
        ? { type: "json_schema" as const, json_schema: { name: req.jsonSchema.name, schema: req.jsonSchema.schema, strict: false } }
        : { type: "json_object" as const }
      : undefined;
    try {
      const completion = await this.sdk().chat.completions.create(
        {
          model: req.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: userText },
          ],
          temperature: req.temperature ?? 0.7,
          max_completion_tokens: req.maxOutputTokens ?? 4096,
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(isGptOss ? { reasoning_effort: "low" } : {}),
        } as Parameters<Groq["chat"]["completions"]["create"]>[0],
        { signal: req.signal },
      );
      const c = completion as Groq.Chat.ChatCompletion;
      const choice = c.choices[0];
      const text = choice?.message?.content ?? "";
      if (!text.trim()) throw new AIError("invalid_output", "Groq returned an empty response.", true, "groq");
      return {
        text,
        model: c.model ?? req.model,
        inputTokens: c.usage?.prompt_tokens ?? null,
        outputTokens: c.usage?.completion_tokens ?? null,
        providerRequestId: c.id ?? null,
        finishReason: choice?.finish_reason ?? null,
      };
    } catch (err) {
      throw classifyProviderError(err, "groq");
    }
  }
}
