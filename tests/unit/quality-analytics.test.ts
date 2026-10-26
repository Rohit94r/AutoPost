import { describe, expect, it } from "vitest";
import { engagementRate, successRate, sumMetric } from "@/lib/analytics";
import { checkQuality, findUnsupportedNumbers } from "@/lib/quality";
import { rollupStatus } from "@/server/content/service";

describe("ContentQualityChecker", () => {
  it("flags clichés and avoid-list phrases", () => {
    const r = checkQuality({ text: "I'm thrilled to announce our synergy-driven launch", platform: "linkedin", avoidPhrases: ["launch"] });
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["cliche", "avoided_phrase"]));
  });
  it("flags numbers not present in the source", () => {
    expect(findUnsupportedNumbers("Ranked 1st of 500 teams in 2025", "Our team won first place in 2025")).toEqual(["500"]);
    expect(findUnsupportedNumbers("Completed on 12/03/2026", "Issued 12/03/2026")).toEqual([]);
  });
  it("respects emoji and hashtag preferences", () => {
    const r = checkQuality({ text: "Hi 🎉🎉🎉 #a #b #c #d", platform: "linkedin", emoji: "minimal", hashtags: "minimal" });
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["emoji", "hashtags"]));
  });
});

describe("analytics calculations", () => {
  it("success rate excludes pending/cancelled and is null with no data", () => {
    expect(successRate(3, 1)).toBe(0.75);
    expect(successRate(0, 0)).toBeNull();
  });
  it("engagement rate only uses posts with exposure and interactions", () => {
    const rows = [
      { postId: "a", metric: "impressions", value: 1000, availability: "available" as const },
      { postId: "a", metric: "likes", value: 40, availability: "available" as const },
      { postId: "a", metric: "comments", value: 10, availability: "available" as const },
      { postId: "b", metric: "likes", value: 99, availability: "available" as const },
      { postId: "b", metric: "impressions", value: null, availability: "permission_missing" as const },
    ];
    const r = engagementRate(rows);
    expect(r.rate).toBeCloseTo(0.05);
    expect(r.postsUsed).toBe(1);
    expect(engagementRate([]).rate).toBeNull();
  });
  it("sumMetric reports missing data honestly", () => {
    const s = sumMetric(
      [
        { postId: "a", metric: "likes", value: 5, availability: "available" },
        { postId: "b", metric: "likes", value: null, availability: "unsupported" },
      ],
      "likes",
    );
    expect(s).toMatchObject({ total: 5, postsWithData: 1, postsWithout: 1, reasons: ["unsupported"] });
    expect(sumMetric([], "likes").total).toBeNull();
  });
});

describe("content status rollup", () => {
  it("handles partial success and pending states", () => {
    expect(rollupStatus(["published", "failed"])).toBe("partially_published");
    expect(rollupStatus(["published", "published"])).toBe("published");
    expect(rollupStatus(["scheduled", "scheduled"])).toBe("scheduled");
    expect(rollupStatus(["processing", "published"])).toBe("publishing");
    expect(rollupStatus(["failed", "needs_reconnection"])).toBe("failed");
    expect(rollupStatus(["cancelled"])).toBe("cancelled");
    expect(rollupStatus([])).toBe("draft");
  });
});
