import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { finalPostText } from "@/lib/platforms";
import { fitForInstagram, fitForLinkedIn, fitForX, INSTAGRAM } from "@/server/media/transform";
import { createSignedRequest, parseSignedRequest } from "@/server/meta/signed-request";

describe("Meta signed_request", () => {
  it("accepts a correctly signed payload", () => {
    const signed = createSignedRequest({ user_id: "1784", issued_at: 1 }, "app-secret");
    expect(parseSignedRequest(signed, "app-secret")).toMatchObject({ user_id: "1784", algorithm: "HMAC-SHA256" });
  });
  it("rejects wrong secrets, tampering and junk", () => {
    const signed = createSignedRequest({ user_id: "1784" }, "app-secret");
    expect(parseSignedRequest(signed, "other-secret")).toBeNull();
    const [sig, payload] = signed.split(".");
    const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, "app-secret")).toBeNull();
    expect(parseSignedRequest(`${sig}`, "app-secret")).toBeNull();
    expect(parseSignedRequest(`${sig}.${payload}x`, "app-secret")).toBeNull();
    expect(parseSignedRequest("not-a-request", "app-secret")).toBeNull();
  });
});

describe("final post text", () => {
  it("appends links on LinkedIn and X but not Instagram", () => {
    expect(finalPostText("x", "Read this", ["ai"], "https://ex.com/a")).toBe("Read this\n\n#ai\n\nhttps://ex.com/a");
    expect(finalPostText("instagram", "Read this", [], "https://ex.com/a")).toBe("Read this");
    expect(finalPostText("linkedin", "See https://ex.com/a", [], "https://ex.com/a")).toBe("See https://ex.com/a");
  });
});

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#3a7" } }).png().toBuffer();

describe("platform image fitting", () => {
  it("letterboxes tall images into Instagram's 4:5 minimum and converts to JPEG", async () => {
    const out = await fitForInstagram(await img(900, 1600)); // 9:16 story-shaped
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width! / meta.height!).toBeGreaterThanOrEqual(INSTAGRAM.minRatio - 0.01);
    expect(meta.height).toBe(1600);
  });
  it("letterboxes very wide images and caps width at 1440", async () => {
    const out = await fitForInstagram(await img(3000, 1000));
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeLessThanOrEqual(INSTAGRAM.maxWidth);
    expect(meta.width! / meta.height!).toBeLessThanOrEqual(INSTAGRAM.maxRatio + 0.01);
  });
  it("converts WebP for LinkedIn and leaves PNG alone", async () => {
    const webp = await sharp(await img(200, 200)).webp().toBuffer();
    expect((await fitForLinkedIn(webp, "image/webp"))?.mime).toBe("image/jpeg");
    expect(await fitForLinkedIn(await img(200, 200), "image/png")).toBeNull();
  });
  it("leaves small X images untouched", async () => {
    expect(await fitForX(await img(100, 100), "image/png")).toBeNull();
  });
});
