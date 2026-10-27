import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeUpload, startUpload } from "@/server/uploads/service";
import { createTestDb, seedUserWorkspace } from "../helpers/db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

describe("direct uploads (browser → storage → validate)", () => {
  it("turns an uploaded image into media and removes the temporary object", async () => {
    const { userId, workspaceId } = await seedUserWorkspace(t.db);
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2fa86a" } }).png().toBuffer();
    const start = await startUpload(workspaceId, { purpose: "media", filename: "photo.png", contentType: "image/png", size: png.length });
    expect(start.direct).toBe(true);
    if (!start.direct) return;
    expect(start.key.startsWith(`uploads/${workspaceId}/`)).toBe(true);
    t.mem.set(start.key, png); // what the browser's PUT would have stored

    const r = await completeUpload({ workspaceId, userId, correlationId: "c1" }, { purpose: "media", key: start.key, filename: "photo.png", contentType: "image/png" });
    expect(r).toMatchObject({ media: { kind: "image", width: 800, height: 600 } });
    expect(t.mem.has(start.key)).toBe(false);
  });

  it("refuses another workspace's upload, disguised files and oversized files", async () => {
    const a = await seedUserWorkspace(t.db);
    const b = await seedUserWorkspace(t.db);
    const start = await startUpload(a.workspaceId, { purpose: "media", filename: "x.png", contentType: "image/png", size: 10 });
    if (!start.direct) throw new Error("expected direct upload");
    t.mem.set(start.key, Buffer.from("MZ this is not a png"));
    await expect(completeUpload({ workspaceId: b.workspaceId, userId: b.userId, correlationId: "c2" }, { purpose: "media", key: start.key, filename: "x.png", contentType: "image/png" })).rejects.toThrow(/Unknown upload/);
    await expect(completeUpload({ workspaceId: a.workspaceId, userId: a.userId, correlationId: "c3" }, { purpose: "media", key: start.key, filename: "x.png", contentType: "image/png" })).rejects.toThrow(/unrecognised|Unsupported|match/i);
    expect(t.mem.has(start.key)).toBe(false);

    await expect(startUpload(a.workspaceId, { purpose: "media", filename: "big.png", contentType: "image/png", size: 500 * 1024 * 1024 })).rejects.toThrow(/too large/);
    await expect(startUpload(a.workspaceId, { purpose: "document", filename: "x.exe", contentType: "application/x-msdownload", size: 10 })).rejects.toThrow(/Unsupported/);
  });
});
