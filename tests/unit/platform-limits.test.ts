import { describe, expect, it } from "vitest";
import { composeFinalText, validateMedia, validateText, xWeightedLength } from "@/lib/platforms";

describe("X weighted character counting", () => {
  it("counts Latin text as 1 per char", () => {
    expect(xWeightedLength("hello world")).toBe(11);
  });
  it("counts URLs as 23 regardless of length", () => {
    expect(xWeightedLength("see https://example.com/a/very/long/path?with=query")).toBe(4 + 23);
  });
  it("counts emoji and CJK as 2", () => {
    expect(xWeightedLength("🎉")).toBe(2);
    expect(xWeightedLength("日本")).toBe(4);
  });
  it("flags posts over 280 weighted chars", () => {
    const issues = validateText("x", "a".repeat(281));
    expect(issues.some((i) => i.code === "too_long" && i.level === "error")).toBe(true);
    expect(validateText("x", "a".repeat(280)).some((i) => i.level === "error")).toBe(false);
    expect(validateText("x", "日".repeat(141)).some((i) => i.code === "too_long")).toBe(true);
  });
});

describe("platform validation", () => {
  it("requires media on Instagram", () => {
    expect(validateText("instagram", "caption").some((i) => i.code === "media_required")).toBe(true);
    expect(validateText("instagram", "caption", { mediaCount: 1 }).some((i) => i.code === "media_required")).toBe(false);
  });
  it("enforces Instagram 30-hashtag limit and LinkedIn 3000 chars", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(validateText("instagram", tags, { mediaCount: 1 }).some((i) => i.code === "too_many_hashtags")).toBe(true);
    expect(validateText("linkedin", "a".repeat(3001)).some((i) => i.code === "too_long")).toBe(true);
  });
  it("rejects empty text", () => {
    expect(validateText("linkedin", "   ").some((i) => i.code === "empty")).toBe(true);
  });
  it("validates media combinations", () => {
    expect(validateMedia("x", Array(5).fill({ kind: "image", mimeType: "image/png" })).some((i) => i.code === "too_many_images")).toBe(true);
    expect(validateMedia("linkedin", [{ kind: "video", mimeType: "video/quicktime" }]).some((i) => i.code === "media_format")).toBe(true);
    expect(validateMedia("linkedin", [{ kind: "image", mimeType: "image/webp" }])).toEqual([]); // converted to JPEG
    expect(validateMedia("instagram", [{ kind: "image", mimeType: "image/png" }])).toEqual([]);
  });
});

describe("composeFinalText", () => {
  it("appends hashtags not already present", () => {
    expect(composeFinalText("Shipping #today", ["today", "#launch"])).toBe("Shipping #today\n\n#launch");
    expect(composeFinalText("Body", [])).toBe("Body");
  });
});
