import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { finalPostText, graphemeLength, textLength, validateMedia, validateText } from "@/lib/platforms";
import { resetEnvCache } from "@/server/env";
import { BlueskyAdapter, buildFacets } from "@/server/platforms/bluesky";
import { assertPublicHttpsUrl, isPrivateAddress, setDnsLookupForTesting, setPlatformFetchForTesting } from "@/server/platforms/http";
import { MastodonAdapter, stripHtml } from "@/server/platforms/mastodon";
import { signWebhook } from "@/server/platforms/webhook";
import { textToHtml } from "@/server/platforms/wordpress";
import type { PreparedMedia } from "@/server/platforms/types";

type Call = { url: string; init: RequestInit };
function mockFetch(handler: (c: Call) => Response | undefined) {
  const calls: Call[] = [];
  setPlatformFetchForTesting(async (input, init) => {
    const c = { url: String(input), init: init ?? {} };
    calls.push(c);
    const r = handler(c);
    if (!r) throw new Error(`unmocked ${c.url}`);
    return r;
  });
  return calls;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

beforeAll(() => resetEnvCache());
afterEach(() => {
  setPlatformFetchForTesting(undefined);
  setDnsLookupForTesting(undefined);
});

describe("SSRF guard for user-supplied hosts", () => {
  it("classifies private and public addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(a)).toBe(true);
    }
    for (const a of ["1.1.1.1", "93.184.216.34", "2606:4700::1111"]) expect(isPrivateAddress(a)).toBe(false);
  });

  it("rejects http, localhost, embedded credentials and hosts resolving to private IPs", async () => {
    setDnsLookupForTesting(async (h) => [{ address: h === "evil.example" ? "10.0.0.5" : "93.184.216.34" }]);
    await expect(assertPublicHttpsUrl("http://site.example/x")).rejects.toThrow(/https/);
    await expect(assertPublicHttpsUrl("https://localhost/x")).rejects.toThrow(/Private/);
    await expect(assertPublicHttpsUrl("https://user:pw@site.example/")).rejects.toThrow(/credentials/);
    await expect(assertPublicHttpsUrl("https://evil.example/hook")).rejects.toThrow(/Private/);
    await expect(assertPublicHttpsUrl("https://192.168.0.10/")).rejects.toThrow(/Private/);
    await expect(assertPublicHttpsUrl("https://site.example/hook")).resolves.toBeInstanceOf(URL);
  });
});

describe("text rules for new platforms", () => {
  it("counts graphemes for Bluesky (emoji families count once)", () => {
    expect(graphemeLength("👨‍👩‍👧")).toBe(1);
    expect(textLength("bluesky", "a".repeat(300))).toBe(300);
    expect(validateText("bluesky", "a".repeat(301)).some((i) => i.code === "too_long")).toBe(true);
    expect(validateText("threads", "a".repeat(501)).some((i) => i.code === "too_long")).toBe(true);
  });
  it("requires the right media kind", () => {
    expect(validateText("youtube", "desc").some((i) => i.message.includes("a video"))).toBe(true);
    expect(validateMedia("youtube", [{ kind: "image", mimeType: "image/jpeg" }]).some((i) => i.code === "media_kind")).toBe(true);
    expect(validateMedia("pinterest", [{ kind: "image", mimeType: "image/png" }])).toEqual([]);
  });
  it("doesn't put links in captions where they aren't clickable", () => {
    expect(finalPostText("tiktok", "Hi", [], "https://ex.com")).toBe("Hi");
    expect(finalPostText("mastodon", "Hi", [], "https://ex.com")).toBe("Hi\n\nhttps://ex.com");
  });
});

describe("Bluesky", () => {
  it("builds byte-accurate facets for links and hashtags", () => {
    const text = "Café 🎉 https://ex.com/a. #ship";
    const facets = buildFacets(text) as { index: { byteStart: number; byteEnd: number }; features: { uri?: string; tag?: string }[] }[];
    const bytes = new TextEncoder().encode(text);
    const slice = (f: (typeof facets)[number]) => new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
    expect(facets.map(slice)).toEqual(["https://ex.com/a", "#ship"]);
    expect(facets[0]!.features[0]!.uri).toBe("https://ex.com/a");
    expect(facets[1]!.features[0]!.tag).toBe("ship");
  });

  it("connects with an app password and publishes a post", async () => {
    const calls = mockFetch((c) => {
      if (c.url.endsWith("createSession")) return json({ did: "did:plc:abc", handle: "me.bsky.social", accessJwt: "a.eyJleHAiOjk5OTk5OTk5OTl9.s", refreshJwt: "r" });
      if (c.url.includes("getProfile")) return json({ displayName: "Me" });
      if (c.url.endsWith("createRecord")) return json({ uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz", cid: "bafy" });
      return undefined;
    });
    const a = new BlueskyAdapter();
    const { tokens, profiles } = await a.connectWithCredentials({ handle: "@me.bsky.social", appPassword: "xxxx-xxxx" });
    expect(profiles[0]).toMatchObject({ externalId: "did:plc:abc", username: "me.bsky.social" });
    expect(tokens.refreshToken).toBe("https://bsky.social|r");
    expect(tokens.expiresAt?.getUTCFullYear()).toBe(2286);
    const res = await a.publish({ accessToken: tokens.accessToken, account: { externalAccountId: "did:plc:abc", accountType: "user", metadata: { pds: "https://bsky.social", handle: "me.bsky.social" } }, text: "Hello #world", media: [] });
    expect(res.url).toBe("https://bsky.app/profile/me.bsky.social/post/3kxyz");
    const body = JSON.parse(calls.at(-1)!.init.body as string);
    expect(body.record.facets).toHaveLength(1);
  });
});

describe("Mastodon", () => {
  const account = { externalAccountId: "1@social.example", accountType: "user", username: "me@social.example", metadata: { instanceUrl: "https://social.example", accountId: "1" } };

  it("publishes with an Idempotency-Key and reads replies", async () => {
    setDnsLookupForTesting(async () => [{ address: "93.184.216.34" }]);
    const calls = mockFetch((c) => {
      if (c.url.endsWith("/api/v1/statuses")) return json({ id: "99", url: "https://social.example/@me/99", uri: "x", content: "", created_at: "2026-10-26T00:00:00Z", in_reply_to_id: null, account: { id: "1", acct: "me", display_name: "Me", avatar: "", username: "me" } });
      if (c.url.includes("/context"))
        return json({ descendants: [{ id: "100", url: null, uri: "u", content: "<p>Nice &amp; neat</p>", created_at: "2026-10-26T01:00:00Z", in_reply_to_id: "99", account: { id: "2", acct: "ana@x.y", display_name: "Ana", avatar: "", username: "ana" } }] });
      return undefined;
    });
    const a = new MastodonAdapter();
    const r = await a.publish({ accessToken: "tok", account, text: "Hi", media: [], idempotencyKey: "job-1" });
    expect(r.externalPostId).toBe("99");
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("job-1");
    const items = await a.fetchComments({ accessToken: "tok", account, postExternalId: "99" });
    expect(items[0]).toMatchObject({ externalId: "100", kind: "comment", text: "Nice & neat", authorHandle: "ana@x.y", isOwn: false });
  });

  it("refuses instances that resolve to private networks", async () => {
    setDnsLookupForTesting(async () => [{ address: "10.0.0.1" }]);
    await expect(new MastodonAdapter().connectWithCredentials({ instanceUrl: "https://intranet.example", accessToken: "t" })).rejects.toThrow(/Private/);
  });
});

describe("helpers", () => {
  it("strips HTML safely", () => {
    expect(stripHtml("<p>a<br/>b</p><p>c</p>")).toBe("a\nb\n\nc");
  });
  it("converts text to escaped HTML paragraphs with links", () => {
    expect(textToHtml("Hi <b>\n\nSee https://ex.com")).toBe('<p>Hi &lt;b&gt;</p>\n<p>See <a href="https://ex.com">https://ex.com</a></p>');
  });
  it("signs webhooks with HMAC over timestamp and body", () => {
    const sig = signWebhook("s3cret", 1700000000, '{"a":1}');
    expect(sig).toBe(`sha256=${createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex")}`);
  });
});

export const unusedMedia: PreparedMedia | null = null;
