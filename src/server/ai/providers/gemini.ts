import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/server/env";
import { AIError, classifyProviderError, type AIProvider, type GenerateRequest, type GenerateResult } from "../types";

/** GeminiProvider — multimodal (PDF/image) understanding and generation via the official @google/genai SDK. */
export class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly supportsFiles = true;
  private client: GoogleGenAI | undefined;

  constructor(private readonly apiKey = env().GEMINI_API_KEY) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  private sdk() {
    if (!this.apiKey) throw new AIError("not_configured", "GEMINI_API_KEY is not set.", false, "gemini");
    this.client ??= new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const parts = req.parts.map((p) =>
      p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mimeType, data: p.data.toString("base64") } },
    );
    try {
      const res = await this.sdk().models.generateContent({
        model: req.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: req.system,
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: req.maxOutputTokens ?? 8192,
          abortSignal: req.signal,
          ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema.schema } : {}),
        },
      });
      const blocked = res.promptFeedback?.blockReason;
      if (blocked) throw new AIError("content_blocked", `Gemini blocked the request (${blocked}).`, false, "gemini");
      const text = res.text ?? "";
      const finish = res.candidates?.[0]?.finishReason ?? null;
      if (!text.trim()) {
        throw new AIError(
          finish === "SAFETY" ? "content_blocked" : "invalid_output",
          finish === "SAFETY" ? "Gemini declined to generate this content." : "Gemini returned an empty response.",
          finish !== "SAFETY",
          "gemini",
        );
      }
      const u = res.usageMetadata;
      return {
        text,
        model: res.modelVersion ?? req.model,
        inputTokens: u?.promptTokenCount ?? null,
        // thinking tokens are billed as output
        outputTokens: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null,
        providerRequestId: res.responseId ?? null,
        finishReason: finish ? String(finish) : null,
      };
    } catch (err) {
      throw classifyProviderError(err, "gemini");
    }
  }
}
