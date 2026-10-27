import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseStorage, setStorageForTesting, type StorageDriver } from "@/server/storage";
import { completeUpload, startUpload, uploadChunk, UPLOAD_CHUNK_BYTES } from "@/server/uploads/service";
import { createTestDb, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let memStore: StorageDriver;
beforeAll(async () => {
  t = await createTestDb();
  const { storage } = await import("@/server/storage");
  memStore = storage();
});
afterAll(async () => t.close());

const png = (w = 800, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: "#2fa86a" } }).png().toBuffer();

describe("direct uploads (browser → bucket → validate)", () => {
  it("turns an uploaded image into media and removes the temporary object", async () => {
    setStorageForTesting(memStore);
    const { userId, workspaceId } = await seedUserWorkspace(t.db);
    const data = await png();
    const start = await startUpload(workspaceId, { purpose: "media", filename: "photo.png", contentType: "image/png", size: data.length });
    if (start.mode !== "direct") throw new Error("expected a direct upload");
    expect(start.key.startsWith(`uploads/${workspaceId}/`)).toBe(true);
    t.mem.set(start.key, data); // what the browser's PUT would have stored

    const r = await completeUpload({ workspaceId, userId, correlationId: "c1" }, { purpose: "media", key: start.key, filename: "photo.png", contentType: "image/png" });
    expect(r).toMatchObject({ media: { kind: "image", width: 800, height: 600 } });
    expect(t.mem.has(start.key)).toBe(false);
  });

  it("refuses another workspace's upload, disguised files and oversized files", async () => {
    setStorageForTesting(memStore);
    const a = await seedUserWorkspace(t.db);
    const b = await seedUserWorkspace(t.db);
    const start = await startUpload(a.workspaceId, { purpose: "media", filename: "x.png", contentType: "image/png", size: 10 });
    if (start.mode !== "direct") throw new Error("expected a direct upload");
    t.mem.set(start.key, Buffer.from("MZ this is not a png"));
    await expect(completeUpload({ workspaceId: b.workspaceId, userId: b.userId, correlationId: "c2" }, { purpose: "media", key: start.key, filename: "x.png", contentType: "image/png" })).rejects.toThrow(/Unknown upload/);
    await expect(completeUpload({ workspaceId: a.workspaceId, userId: a.userId, correlationId: "c3" }, { purpose: "media", key: start.key, filename: "x.png", contentType: "image/png" })).rejects.toThrow(/unrecognised|Unsupported|match/i);
    expect(t.mem.has(start.key)).toBe(false);

    await expect(startUpload(a.workspaceId, { purpose: "media", filename: "big.png", contentType: "image/png", size: 500 * 1024 * 1024 })).rejects.toThrow(/too large/);
    await expect(startUpload(a.workspaceId, { purpose: "document", filename: "x.exe", contentType: "application/x-msdownload", size: 10 })).rejects.toThrow(/Unsupported/);
  });
});

describe("database storage (files in Postgres, default on Vercel)", () => {
  it("stores, streams, sizes and deletes objects across chunks", async () => {
    const store = new DatabaseStorage();
    const big = Buffer.alloc(DatabaseStorage.CHUNK * 2 + 123, 7);
    await store.put("media/x/big.bin", big, "application/octet-stream");
    expect(await store.size("media/x/big.bin")).toBe(big.length);
    expect((await store.get("media/x/big.bin")).equals(big)).toBe(true);
    const { body, size } = await store.stream("media/x/big.bin");
    expect(size).toBe(big.length);
    expect(Buffer.from(await new Response(body).arrayBuffer()).equals(big)).toBe(true);
    await store.delete("media/x/big.bin");
    expect(await store.size("media/x/big.bin")).toBeNull();
  });

  it("uploads in parts through the app and validates the result", async () => {
    setStorageForTesting(new DatabaseStorage());
    try {
      const { userId, workspaceId } = await seedUserWorkspace(t.db);
      const data = await sharp({ create: { width: 1400, height: 1400, channels: 3, background: "#e07a5f" } }).png({ compressionLevel: 0 }).toBuffer();
      expect(data.length).toBeGreaterThan(UPLOAD_CHUNK_BYTES); // needs more than one part
      const start = await startUpload(workspaceId, { purpose: "media", filename: "big.png", contentType: "image/png", size: data.length });
      if (start.mode !== "chunked") throw new Error("expected a chunked upload");
      for (let i = 0; i * start.chunkSize < data.length; i++) await uploadChunk(workspaceId, start.key, i, data.subarray(i * start.chunkSize, (i + 1) * start.chunkSize));
      const r = await completeUpload({ workspaceId, userId, correlationId: "c4" }, { purpose: "media", key: start.key, filename: "big.png", contentType: "image/png" });
      expect(r).toMatchObject({ media: { kind: "image", width: 1400, height: 1400 } });
      const other = await seedUserWorkspace(t.db);
      await expect(uploadChunk(other.workspaceId, start.key, 0, Buffer.alloc(10))).rejects.toThrow(/Unknown upload/);
      await expect(uploadChunk(workspaceId, start.key, -1, Buffer.alloc(10))).rejects.toThrow(/Invalid upload part/);
      await expect(uploadChunk(workspaceId, start.key, 0, Buffer.alloc(UPLOAD_CHUNK_BYTES + 1))).rejects.toThrow(/size/);
    } finally {
      setStorageForTesting(memStore);
    }
  });
});

describe("abandoned uploads", () => {
  it("are removed from the database after a day", async () => {
    const { retention } = await import("@/server/maintenance");
    const { storedFileChunks } = await import("@/server/db/schema");
    const old = new Date(Date.now() - 2 * 86400_000);
    await t.db.insert(storedFileChunks).values([
      { key: "uploads/old/part", idx: 0, data: Buffer.alloc(5), createdAt: old },
      { key: "uploads/new/part", idx: 0, data: Buffer.alloc(5) },
      { key: "media/keep/file", idx: 0, data: Buffer.alloc(5), createdAt: old },
    ]);
    const r = await retention();
    expect(r.abandonedUploadParts).toBe(1);
    const left = (await t.db.select({ key: storedFileChunks.key }).from(storedFileChunks)).map((x) => x.key);
    expect(left).toEqual(expect.arrayContaining(["uploads/new/part", "media/keep/file"]));
    expect(left).not.toContain("uploads/old/part");
  });
});
