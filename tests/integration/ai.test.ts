import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { generateVariants } from "@/server/ai/content-generator";
import { ModelRegistry, setRegistryForTesting } from "@/server/ai/registry";
import { runTask } from "@/server/ai/service";
import { AIError, type AIProvider, type GenerateRequest } from "@/server/ai/types";
import type { Database } from "@/server/db";
import { aiGenerations, usageRecords } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { writingControlsSchema } from "@/lib/writing";
import { createTestDb, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;
beforeAll(async () => {
  process.env.AI_MAX_RETRIES = "1";
  process.env.AI_TIMEOUT_MS = "200";
  resetEnvCache();
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => {
  delete process.env.AI_MAX_RETRIES;
  delete process.env.AI_TIMEOUT_MS;
  resetEnvCache();
  await t.close();
});
afterEach(() => setRegistryForTesting(undefined));

function provider(id: "groq" | "gemini", impl: (r: GenerateRequest) => Promise<string>, configured = true): AIProvider & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = [];
  return {
    id,
    supportsFiles: id === "gemini",
    calls,
    isConfigured: () => configured,
    generate: async (r) => {
      calls.push(r);
      return { text: await impl(r), model: r.model, inputTokens: 10, outputTokens: 20, providerRequestId: "req-1", finishReason: "stop" };
    },
  };
}

const schema = z.object({ text: z.string() });

describe("AI service", () => {
  it("validates structured output, records usage and generation", async () => {
    const ws = await seedUserWorkspace(db);
    setRegistryForTesting(new ModelRegistry({ groq: provider("groq", async () => '```json\n{"text":"ok"}\n```'), gemini: provider("gemini", async () => "{}", false) }));
    const r = await runTask({ task: "rewrite", workspaceId: ws.workspaceId, userId: ws.userId, correlationId: "c1", system: "s", parts: [{ type: "text", text: "u" }], schema, schemaName: "x" });
    expect(r.data.text).toBe("ok");
    const gens = await db.select().from(aiGenerations).where(eq(aiGenerations.workspaceId, ws.workspaceId));
    expect(gens[0]).toMatchObject({ status: "succeeded", provider: "groq", inputTokens: 10, outputTokens: 20 });
    const usage = await db.select().from(usageRecords).where(eq(usageRecords.workspaceId, ws.workspaceId));
    expect(usage.map((u) => u.metric).sort()).toEqual(["ai_request", "ai_tokens"]);
  });

  it("repairs malformed JSON once, then fails clearly", async () => {
    const ws = await seedUserWorkspace(db);
    let n = 0;
    const p = provider("groq", async () => (++n === 1 ? "not json" : '{"text":"fixed"}'));
    setRegistryForTesting(new ModelRegistry({ groq: p, gemini: provider("gemini", async () => "", false) }));
    const r = await runTask({ task: "rewrite", workspaceId: ws.workspaceId, correlationId: "c", system: "s", parts: [{ type: "text", text: "u" }], schema, schemaName: "x" });
    expect(r.data.text).toBe("fixed");

    setRegistryForTesting(new ModelRegistry({ groq: provider("groq", async () => '{"wrong":1}'), gemini: provider("gemini", async () => "", false) }));
    await expect(runTask({ task: "rewrite", workspaceId: ws.workspaceId, correlationId: "c", system: "s", parts: [{ type: "text", text: "u" }], schema, schemaName: "x" })).rejects.toMatchObject({
      code: "ai_invalid_output",
      message: expect.stringContaining("original content has not been changed"),
    });
  });

  it("retries timeouts a bounded number of times, then returns 504", async () => {
    const ws = await seedUserWorkspace(db);
    const p = provider("groq", async () => {
      throw new AIError("timeout", "slow", true, "groq");
    });
    setRegistryForTesting(new ModelRegistry({ groq: p, gemini: provider("gemini", async () => "", false) }));
    await expect(runTask({ task: "draft", workspaceId: ws.workspaceId, correlationId: "c", system: "s", parts: [{ type: "text", text: "u" }], schema, schemaName: "x" })).rejects.toMatchObject({ status: 504 });
    expect(p.calls).toHaveLength(2); // 1 + AI_MAX_RETRIES
  });

  it("never re-routes document extraction to another provider", async () => {
    const ws = await seedUserWorkspace(db);
    const groq = provider("groq", async () => '{"text":"leak"}');
    setRegistryForTesting(new ModelRegistry({ groq, gemini: provider("gemini", async () => "", false) }));
    await expect(
      runTask({ task: "extract", workspaceId: ws.workspaceId, correlationId: "c", system: "s", parts: [{ type: "file", mimeType: "application/pdf", data: Buffer.from("x") }], schema, schemaName: "x" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(groq.calls).toHaveLength(0);
  });

  it("uses the other provider for text tasks when the primary has no key, and reports it", async () => {
    const ws = await seedUserWorkspace(db);
    const gemini = provider("gemini", async () => '{"variants":[{"platform":"x","text":"Shipped v2 today","hashtags":[]}]}');
    setRegistryForTesting(new ModelRegistry({ groq: provider("groq", async () => "", false), gemini }));
    const r = await generateVariants(
      { workspaceId: ws.workspaceId, userId: ws.userId, correlationId: "c" },
      { idea: "We shipped v2 today", platforms: ["x"], controls: writingControlsSchema.parse({}) },
    );
    expect(r.provider).toBe("gemini");
    expect(r.variants[0]!.text).toBe("Shipped v2 today");
    expect(gemini.calls[0]!.parts[0]!.type === "text" && gemini.calls[0]!.parts[0]!.text).toContain("<untrusted_idea>");
  });

  it("flags fabricated figures in generated variants", async () => {
    const ws = await seedUserWorkspace(db);
    setRegistryForTesting(
      new ModelRegistry({ groq: provider("groq", async () => '{"variants":[{"platform":"linkedin","text":"We grew 300% to 5000 users","hashtags":[]}]}'), gemini: provider("gemini", async () => "", false) }),
    );
    const r = await generateVariants({ workspaceId: ws.workspaceId, userId: ws.userId, correlationId: "c" }, { idea: "We launched our app", platforms: ["linkedin"], controls: writingControlsSchema.parse({}) });
    expect(r.variants[0]!.issues.some((i) => i.code === "unsupported_claim")).toBe(true);
  });
});
