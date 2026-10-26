import "server-only";
import { env } from "@/server/env";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { AIError, type AIProvider, type AITask, type ProviderId } from "./types";

export interface ModelRoute {
  provider: ProviderId;
  model: string;
}

/**
 * ModelRegistry — maps each task to a provider+model. Defaults (verified 2026-10-26) can be
 * overridden with AI_MODEL_<TASK>=provider:model, so model churn never requires code changes.
 */
export const DEFAULT_ROUTES: Record<AITask, ModelRoute> = {
  draft: { provider: "groq", model: "openai/gpt-oss-120b" },
  adapt: { provider: "groq", model: "openai/gpt-oss-120b" },
  rewrite: { provider: "groq", model: "openai/gpt-oss-20b" },
  hashtags: { provider: "groq", model: "openai/gpt-oss-20b" },
  extract: { provider: "gemini", model: "gemini-3.8-flash" },
  critique: { provider: "gemini", model: "gemini-3.8-flash" },
  voice: { provider: "gemini", model: "gemini-3.8-flash" },
  reply: { provider: "groq", model: "openai/gpt-oss-120b" },
};

export const PROVIDER_DEFAULT_MODEL: Record<ProviderId, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-3.8-flash",
};

/** Tasks whose input may contain uploaded documents — never routed to a different provider silently. */
export const SENSITIVE_TASKS: ReadonlySet<AITask> = new Set(["extract"]);

export function parseRoute(value: string | undefined): ModelRoute | undefined {
  if (!value) return undefined;
  const idx = value.indexOf(":");
  if (idx <= 0) return undefined;
  const provider = value.slice(0, idx) as ProviderId;
  const model = value.slice(idx + 1).trim();
  if ((provider !== "groq" && provider !== "gemini") || !model) return undefined;
  return { provider, model };
}

export class ModelRegistry {
  private readonly providers: Record<ProviderId, AIProvider>;

  constructor(providers?: Partial<Record<ProviderId, AIProvider>>) {
    this.providers = {
      groq: providers?.groq ?? new GroqProvider(),
      gemini: providers?.gemini ?? new GeminiProvider(),
    };
  }

  provider(id: ProviderId) {
    return this.providers[id];
  }

  configuredRoute(task: AITask): ModelRoute {
    const e = env();
    const override = {
      draft: e.AI_MODEL_DRAFT,
      adapt: e.AI_MODEL_ADAPT,
      rewrite: e.AI_MODEL_REWRITE,
      hashtags: e.AI_MODEL_HASHTAGS,
      extract: e.AI_MODEL_EXTRACT,
      critique: e.AI_MODEL_CRITIQUE,
      voice: e.AI_MODEL_VOICE,
      reply: e.AI_MODEL_REPLY,
    }[task];
    return parseRoute(override) ?? DEFAULT_ROUTES[task];
  }

  /**
   * Resolve the route for a task. When the configured provider has no credentials, text-only
   * tasks use the other configured provider (the response always reports which one ran).
   * File-bearing tasks require a provider that supports files.
   */
  resolve(task: AITask, opts: { needsFiles?: boolean } = {}): ModelRoute {
    const route = this.configuredRoute(task);
    const primary = this.providers[route.provider];
    const ok = (p: AIProvider) => p.isConfigured() && (!opts.needsFiles || p.supportsFiles);
    if (ok(primary)) return route;
    if (!SENSITIVE_TASKS.has(task)) {
      const otherId: ProviderId = route.provider === "groq" ? "gemini" : "groq";
      const other = this.providers[otherId];
      if (ok(other)) return { provider: otherId, model: PROVIDER_DEFAULT_MODEL[otherId] };
    }
    if (opts.needsFiles && !primary.supportsFiles) {
      throw new AIError("not_configured", `The model configured for "${task}" cannot read files. Configure a Gemini model.`, false);
    }
    throw new AIError(
      "not_configured",
      `No AI provider is configured for "${task}". Set ${route.provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"}.`,
      false,
    );
  }

  fallbackRoute(task: AITask, primary: ModelRoute, opts: { needsFiles?: boolean } = {}): ModelRoute | null {
    if (SENSITIVE_TASKS.has(task)) return null;
    const fb = parseRoute(env().AI_MODEL_FALLBACK);
    if (!fb || (fb.provider === primary.provider && fb.model === primary.model)) return null;
    const p = this.providers[fb.provider];
    if (!p.isConfigured() || (opts.needsFiles && !p.supportsFiles)) return null;
    return fb;
  }

  status() {
    return {
      groq: this.providers.groq.isConfigured(),
      gemini: this.providers.gemini.isConfigured(),
      routes: Object.fromEntries((Object.keys(DEFAULT_ROUTES) as AITask[]).map((t) => [t, this.configuredRoute(t)])),
    };
  }
}

let registry: ModelRegistry | undefined;
export const getRegistry = () => (registry ??= new ModelRegistry());
export const setRegistryForTesting = (r: ModelRegistry | undefined) => {
  registry = r;
};
