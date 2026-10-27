import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ModelRegistry, setRegistryForTesting } from "@/server/ai/registry";
import type { AIProvider, GenerateRequest } from "@/server/ai/types";
import { readMedia, writeFromDocument } from "@/server/autofill/service";
import { uploadedDocuments, workspaces } from "@/server/db/schema";
import { uploadMedia } from "@/server/media/service";
import { writingControlsSchema } from "@/lib/writing";
import { createTestDb, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());
afterEach(() => setRegistryForTesting(undefined));

const EXTRACTION = {
  documentType: "certificate",
  summary: "Certificate of completion for the Google Data Analytics course.",
  fields: [
    { key: "course_name", label: "Course", value: "Google Data Analytics", confidence: "high" },
    { key: "recipient", label: "Awarded to", value: "Rohit", confidence: "high" },
    { key: "full_text", label: "Full text", value: "CERTIFICATE ... very long text", confidence: "high" },
  ],
  missing: [],
  warnings: [],
};

function fakeAI() {
  const calls: GenerateRequest[] = [];
  const provider = (id: "groq" | "gemini"): AIProvider => ({
    id,
    supportsFiles: id === "gemini",
    isConfigured: () => true,
    generate: async (r) => {
      calls.push(r);
      const text = r.parts.some((p) => p.type === "file")
        ? JSON.stringify(EXTRACTION)
        : JSON.stringify({ variants: [{ platform: "linkedin", text: "Finished the Google Data Analytics certificate.", hashtags: ["data"] }, { platform: "x", text: "Done: Google Data Analytics ✅", hashtags: [] }] });
      return { text, model: r.model, inputTokens: 1, outputTokens: 1, providerRequestId: "r", finishReason: "stop" };
    },
  });
  setRegistryForTesting(new ModelRegistry({ groq: provider("groq"), gemini: provider("gemini") }));
  return calls;
}

async function photo(workspaceId: string, userId: string, type = "image/png") {
  const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#fff" } }).png().toBuffer();
  return uploadMedia({ workspaceId, userId, file: new File([new Uint8Array(png)], "certificate.png", { type }) });
}

describe("upload a file, get a post", () => {
  it("reads a photo and writes every platform version from what it found", async () => {
    const calls = fakeAI();
    const { userId, workspaceId } = await seedUserWorkspace(t.db);
    await t.db.update(workspaces).set({ aiProcessingConsentAt: new Date() }).where(eq(workspaces.id, workspaceId));
    const m = await photo(workspaceId, userId);
    const ctx = { workspaceId, userId, correlationId: "c1" };

    const { documentId } = await readMedia(ctx, m.id);
    const [doc] = await t.db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(doc!.status).toBe("extracted");

    const r = await writeFromDocument(ctx, documentId, { platforms: ["linkedin", "x"], controls: writingControlsSchema.parse({}) });
    expect(r.title).toBe("Google Data Analytics");
    expect(r.body).toContain("Course: Google Data Analytics");
    expect(r.body).not.toContain("Full text"); // the raw text isn't dumped into the post
    expect(r.variants.map((v) => v.platform)).toEqual(["linkedin", "x"]);
    expect(r.variants[0]!.text).toContain("Google Data Analytics");
    // The writing step used the certificate style and the facts that were read.
    const draftCall = calls.find((c) => !c.parts.some((p) => p.type === "file"))!;
    expect(draftCall.system).toMatch(/certificate announcement/i);
    const [after] = await t.db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(after!.status).toBe("reviewed");
  });

  it("respects the workspace's AI setting and only reads photos and PDFs", async () => {
    fakeAI();
    const { userId, workspaceId } = await seedUserWorkspace(t.db);
    const m = await photo(workspaceId, userId);
    await t.db.update(workspaces).set({ aiProcessingConsentAt: null }).where(eq(workspaces.id, workspaceId));
    await expect(readMedia({ workspaceId, userId, correlationId: "c2" }, m.id)).rejects.toThrow(/AI processing/);

    await t.db.update(workspaces).set({ aiProcessingConsentAt: new Date() }).where(eq(workspaces.id, workspaceId));
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    const g = await uploadMedia({ workspaceId, userId, file: new File([new Uint8Array(gif)], "a.gif", { type: "image/gif" }) });
    await expect(readMedia({ workspaceId, userId, correlationId: "c3" }, g.id)).rejects.toThrow(/Only photos/);
  });
});
