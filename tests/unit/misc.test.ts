import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/diff";
import { planLimits, PLANS } from "@/lib/plans";
import { writingControlsSchema } from "@/lib/writing";
import { DEFAULT_ROUTES, parseRoute, SENSITIVE_TASKS } from "@/server/ai/registry";
import { extractionOutput, jsonSchemaFor, variantsOutput } from "@/server/ai/schemas";
import { parseJsonLoose } from "@/server/ai/service";
import { classifyProviderError } from "@/server/ai/types";
import { slugify } from "@/server/workspaces/service";

describe("word diff", () => {
  it("marks additions and removals", () => {
    const parts = wordDiff("I am thrilled to share news", "I am happy to share news");
    expect(parts.filter((p) => p.type === "removed").map((p) => p.text.trim())).toContain("thrilled");
    expect(parts.filter((p) => p.type === "added").map((p) => p.text.trim())).toContain("happy");
    expect(parts.map((p) => (p.type === "removed" ? "" : p.text)).join("")).toBe("I am happy to share news");
  });
});

describe("model registry config", () => {
  it("parses provider:model overrides", () => {
    expect(parseRoute("groq:openai/gpt-oss-20b")).toEqual({ provider: "groq", model: "openai/gpt-oss-20b" });
    expect(parseRoute("gemini:gemini-3.8-flash")).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
    expect(parseRoute("openai:gpt")).toBeUndefined();
    expect(parseRoute("groq:")).toBeUndefined();
  });
  it("routes documents to a file-capable provider and marks them sensitive", () => {
    expect(DEFAULT_ROUTES.extract.provider).toBe("gemini");
    expect(SENSITIVE_TASKS.has("extract")).toBe(true);
  });
});

describe("AI output validation", () => {
  it("parses fenced and embedded JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => parseJsonLoose("no json here")).toThrow();
  });
  it("rejects malformed variants and extraction output", () => {
    expect(variantsOutput.safeParse({ variants: [] }).success).toBe(false);
    expect(variantsOutput.safeParse({ variants: [{ platform: "myspace", text: "x" }] }).success).toBe(false);
    expect(extractionOutput.safeParse({ documentType: "certificate", summary: "s", fields: [{ key: "k", label: "l", value: "v", confidence: "certain" }] }).success).toBe(false);
  });
  it("produces JSON Schema for structured output", () => {
    const { schema } = jsonSchemaFor("variants", variantsOutput);
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain("linkedin");
  });
  it("classifies provider errors", () => {
    expect(classifyProviderError({ status: 429, message: "slow down" }, "groq")).toMatchObject({ code: "rate_limited", retryable: true });
    expect(classifyProviderError({ status: 401 }, "gemini")).toMatchObject({ code: "not_configured", retryable: false });
    expect(classifyProviderError({ name: "TimeoutError", message: "timed out" }, "groq")).toMatchObject({ code: "timeout", retryable: true });
    expect(classifyProviderError({ status: 503 }, "gemini")).toMatchObject({ code: "provider_error", retryable: true });
  });
});

describe("configuration helpers", () => {
  it("writing controls have safe defaults", () => {
    expect(writingControlsSchema.parse({})).toMatchObject({ tone: "conversational", length: "medium", emoji: "minimal" });
  });
  it("plan limits fall back to free", () => {
    expect(planLimits("enterprise-unknown")).toEqual(PLANS.free.limits);
    expect(planLimits("pro").connectedAccounts).toBeGreaterThan(planLimits("free").connectedAccounts);
  });
  it("slugifies workspace names", () => {
    expect(slugify("Aarav's   Workspace!")).toBe("aaravs-workspace");
    expect(slugify("***")).toBe("workspace");
  });
});
