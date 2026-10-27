import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/server/env";
import { assertAllowedUrl, setPlatformFetchForTesting } from "@/server/platforms/http";
import { InstagramAdapter } from "@/server/platforms/instagram";
import { LinkedInAdapter, toLittleText } from "@/server/platforms/linkedin";
import { PlatformError, type PreparedMedia } from "@/server/platforms/types";
import { XAdapter } from "@/server/platforms/x";

type Call = { url: string; init: RequestInit };
function mockFetch(routes: ((c: Call) => Response | Promise<Response> | undefined)[]) {
  const calls: Call[] = [];
  setPlatformFetchForTesting(async (input, init) => {
    const c = { url: String(input), init: init ?? {} };
    calls.push(c);
    for (const r of routes) {
      const res = await r(c);
      if (res) return res;
    }
    throw new Error(`unmocked ${c.url}`);
  });
  return calls;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const image = (mime = "image/jpeg"): PreparedMedia => ({
  id: "m1",
  kind: "image",
  mimeType: mime,
  sizeBytes: 3,
  width: 10,
  height: 10,
  altText: "alt",
  load: async () => Buffer.from([1, 2, 3]),
  publicUrl: async () => "https://media.example.test/m1.jpg",
});
const account = { externalAccountId: "urn:li:person:abc", accountType: "member", username: "me", metadata: {} };

beforeAll(() => {
  Object.assign(process.env, {
    LINKEDIN_CLIENT_ID: "li",
    LINKEDIN_CLIENT_SECRET: "li-secret",
    INSTAGRAM_APP_ID: "ig",
    INSTAGRAM_APP_SECRET: "ig-secret",
    X_CLIENT_ID: "x",
    X_CLIENT_SECRET: "x-secret",
  });
  resetEnvCache();
});
afterEach(() => setPlatformFetchForTesting(undefined));

describe("LinkedIn adapter", () => {
  it("escapes little-text and keeps hashtags", () => {
    expect(toLittleText("Hello (world) #AI @me")).toBe("Hello \\(world\\) {hashtag|\\#|AI} \\@me");
  });

  it("publishes a text post with versioned headers and reads x-restli-id", async () => {
    const calls = mockFetch([(c) => (c.url.endsWith("/rest/posts") ? new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } }) : undefined)]);
    const res = await new LinkedInAdapter().publish({ accessToken: "t", account, text: "Hi", media: [] });
    expect(res).toMatchObject({ externalPostId: "urn:li:share:123", url: "https://www.linkedin.com/feed/update/urn:li:share:123/" });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h["LinkedIn-Version"]).toMatch(/^\d{6}$/);
    expect(h["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ author: "urn:li:person:abc", visibility: "PUBLIC", lifecycleState: "PUBLISHED" });
  });

  it("uploads an image before posting", async () => {
    const calls = mockFetch([
      (c) => (c.url.includes("images?action=initializeUpload") ? json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/x", image: "urn:li:image:9" } }) : undefined),
      (c) => (c.url.includes("dms-uploads") ? new Response(null, { status: 201 }) : undefined),
      (c) => (c.url.endsWith("/rest/posts") ? new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:5" } }) : undefined),
    ]);
    await new LinkedInAdapter().publish({ accessToken: "t", account, text: "Pic", media: [image()] });
    expect(JSON.parse(calls[2]!.init.body as string).content.media.id).toBe("urn:li:image:9");
  });

  it("maps 401 to auth and network failure on create to ambiguous", async () => {
    mockFetch([() => json({ message: "expired" }, 401)]);
    await expect(new LinkedInAdapter().publish({ accessToken: "t", account, text: "Hi", media: [] })).rejects.toMatchObject({ kind: "auth" });
    setPlatformFetchForTesting(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new LinkedInAdapter().publish({ accessToken: "t", account, text: "Hi", media: [] })).rejects.toMatchObject({ kind: "ambiguous" });
  });

  it("reports analytics as permission_missing without the scope", async () => {
    const m = await new LinkedInAdapter().fetchMetrics({ accessToken: "t", externalPostId: "urn:li:share:1", grantedScopes: ["w_member_social"] });
    expect(m.every((x) => x.availability === "permission_missing" && x.value === null)).toBe(true);
  });
});

describe("Instagram adapter", () => {
  const igAccount = { externalAccountId: "1789", accountType: "business", metadata: {} };

  it("creates a container, waits for FINISHED, publishes and fetches permalink", async () => {
    const calls = mockFetch([
      (c) => (c.url.includes("content_publishing_limit") ? json({ data: [{ quota_usage: 1, config: { quota_total: 50 } }] }) : undefined),
      (c) => (c.url.endsWith("/1789/media") ? json({ id: "c1" }) : undefined),
      (c) => (c.url.includes("/c1?fields=status_code") ? json({ status_code: "FINISHED" }) : undefined),
      (c) => (c.url.endsWith("/media_publish") ? json({ id: "media9" }) : undefined),
      (c) => (c.url.includes("/media9?fields=permalink") ? json({ permalink: "https://www.instagram.com/p/abc/" }) : undefined),
    ]);
    const res = await new InstagramAdapter().publish({ accessToken: "t", account: igAccount, text: "Caption", media: [image()] });
    expect(res).toEqual({ externalPostId: "media9", url: "https://www.instagram.com/p/abc/" });
    const body = calls.find((c) => c.url.endsWith("/1789/media"))!.init.body as URLSearchParams;
    expect(body.get("image_url")).toBe("https://media.example.test/m1.jpg");
    expect(calls[0]!.url).toContain("/v26.0/");
  });

  it("stops when the daily publishing quota is used up", async () => {
    mockFetch([(c) => (c.url.includes("content_publishing_limit") ? json({ data: [{ quota_usage: 50, config: { quota_total: 50 } }] }) : undefined)]);
    await expect(new InstagramAdapter().publish({ accessToken: "t", account: igAccount, text: "x", media: [image()] })).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("requires media and maps container ERROR to a media failure", async () => {
    await expect(new InstagramAdapter().publish({ accessToken: "t", account: igAccount, text: "x", media: [] })).rejects.toMatchObject({ kind: "validation" });
    mockFetch([
      (c) => (c.url.includes("content_publishing_limit") ? json({ data: [] }) : undefined),
      (c) => (c.url.endsWith("/1789/media") ? json({ id: "c2" }) : undefined),
      (c) => (c.url.includes("/c2?") ? json({ status_code: "ERROR", status: "Unsupported format" }) : undefined),
    ]);
    await expect(new InstagramAdapter().publish({ accessToken: "t", account: igAccount, text: "x", media: [image()] })).rejects.toMatchObject({ kind: "media" });
  });

  it("maps Graph error code 190 to auth", async () => {
    mockFetch([(c) => (c.url.includes("content_publishing_limit") ? json({}) : undefined), () => json({ error: { code: 190, message: "Invalid OAuth access token" } }, 400)]);
    await expect(new InstagramAdapter().publish({ accessToken: "t", account: igAccount, text: "x", media: [image()] })).rejects.toMatchObject({ kind: "auth" });
  });

  it("marks personal accounts ineligible", async () => {
    mockFetch([() => json({ user_id: "42", username: "me", account_type: "PERSONAL" })]);
    const [p] = await new InstagramAdapter().fetchAccounts({ accessToken: "t", scopes: ["instagram_business_basic", "instagram_business_content_publish"] });
    expect(p).toMatchObject({ eligible: false, accountType: "personal" });
  });
});

describe("X adapter", () => {
  const xAccount = { externalAccountId: "99", accountType: "user", username: "flowt", metadata: {} };

  it("builds a PKCE authorize URL", () => {
    const url = new URL(new XAdapter().buildAuthorizeUrl({ state: "s", redirectUri: "http://localhost:3000/cb", codeChallenge: "abc" }));
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("tweet.write");
  });

  it("creates a post and builds the URL", async () => {
    const calls = mockFetch([(c) => (c.url.endsWith("/2/tweets") ? json({ data: { id: "1001", text: "hi" } }, 201) : undefined)]);
    const res = await new XAdapter().publish({ accessToken: "t", account: xAccount, text: "hi", media: [] });
    expect(res.url).toBe("https://x.com/flowt/status/1001");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ text: "hi" });
  });

  it("uploads images via v2 media upload", async () => {
    const calls = mockFetch([
      (c) => (c.url.endsWith("/2/media/upload") ? json({ data: { id: "m-1" } }) : undefined),
      (c) => (c.url.endsWith("/2/tweets") ? json({ data: { id: "1" } }, 201) : undefined),
    ]);
    await new XAdapter().publish({ accessToken: "t", account: xAccount, text: "pic", media: [image("image/png")] });
    expect(JSON.parse(calls[1]!.init.body as string).media.media_ids).toEqual(["m-1"]);
  });

  it("maps 429 with reset header, duplicates and credit errors", async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 120);
    mockFetch([() => json({ title: "Too Many Requests" }, 429, { "x-rate-limit-reset": reset })]);
    const err = await new XAdapter().publish({ accessToken: "t", account: xAccount, text: "x", media: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect(err.kind).toBe("rate_limit");
    expect(err.opts.retryAfterSec).toBeGreaterThan(100);

    mockFetch([() => json({ detail: "You are not allowed to create a Tweet with duplicate content." }, 403)]);
    await expect(new XAdapter().publish({ accessToken: "t", account: xAccount, text: "x", media: [] })).rejects.toMatchObject({ kind: "validation" });

    mockFetch([() => json({ title: "CreditsDepleted", detail: "Your account has no credits" }, 402)]);
    await expect(new XAdapter().publish({ accessToken: "t", account: xAccount, text: "x", media: [] })).rejects.toMatchObject({ kind: "permission" });
  });
});

describe("SSRF guard", () => {
  it("only allows https platform hosts", () => {
    expect(() => assertAllowedUrl("https://api.linkedin.com/rest/posts")).not.toThrow();
    expect(() => assertAllowedUrl("https://graph.instagram.com/v26.0/me")).not.toThrow();
    expect(() => assertAllowedUrl("http://api.x.com/2/tweets")).toThrow();
    expect(() => assertAllowedUrl("https://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => assertAllowedUrl("https://evil-linkedin.com.attacker.io/")).toThrow();
  });
});
