import "server-only";
import { createHash, createHmac } from "node:crypto";
import { BaseAdapter, meta } from "./base";
import { assertPublicHttpsUrl, platformFetch, readJson } from "./http";
import { PlatformError, type CredentialField, type PublishInput, type PublishResult } from "./types";

/**
 * "Custom website": POSTs each post as JSON to the user's endpoint (their site, Zapier/Make/n8n,
 * a serverless function…). Requests are signed so the receiver can verify them:
 *   X-Verdant-Timestamp: <unix seconds>
 *   X-Verdant-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${body}`)>
 */
export function signWebhook(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export class WebhookAdapter extends BaseAdapter {
  readonly platform = "webhook" as const;

  credentialFields(): CredentialField[] {
    return [
      { key: "url", label: "Endpoint URL", type: "url", placeholder: "https://yoursite.com/api/verdant", required: true },
      { key: "secret", label: "Signing secret", type: "password", help: "Make up a long random value (16+ characters) and store the same value on your server to verify the X-Verdant-Signature header.", required: true },
    ];
  }

  private async send(url: string, secret: string, payload: unknown, opts: { ambiguous?: boolean } = {}) {
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const res = await platformFetch(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Verdant-Webhook/1.0", "X-Verdant-Timestamp": String(ts), "X-Verdant-Signature": signWebhook(secret, ts, body) }, body },
      { userHost: true, timeoutMs: 20_000, ...opts },
    );
    if (res.status === 410) throw new PlatformError("auth", "Your endpoint returned 410 Gone. Reconnect with a new URL.");
    if (res.status === 429) throw new PlatformError("rate_limit", "Your endpoint is rate limiting requests.", { retryAfterSec: 60 });
    if (res.status >= 500) throw new PlatformError("transient", `Your endpoint returned ${res.status}.`);
    if (!res.ok) throw new PlatformError("validation", `Your endpoint rejected the post (HTTP ${res.status}).`);
    return readJson(res);
  }

  async connectWithCredentials(values: Record<string, string>) {
    const url = (await assertPublicHttpsUrl((values.url ?? "").trim())).toString();
    // The user chooses the secret so their server can verify signatures (a generated one would never be shown to them).
    const secret = values.secret?.trim() ?? "";
    if (secret.length < 16) throw new PlatformError("validation", "Use a signing secret of at least 16 characters, and store the same value on your server.");
    await this.send(url, secret, { event: "verdant.ping", message: "Verdant is checking this endpoint. Respond with any 2xx status." });
    const host = new URL(url).host;
    return {
      tokens: { accessToken: secret, refreshToken: null, expiresAt: null, scopes: [] },
      profiles: [
        {
          externalId: createHash("sha256").update(url).digest("hex").slice(0, 24),
          displayName: host,
          username: url,
          accountType: "webhook",
          eligible: true,
          metadata: { url, secretHint: `${secret.slice(0, 4)}…` },
        },
      ],
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const url = meta(input.account, "url");
    if (!url) throw new PlatformError("validation", "Endpoint URL is missing. Reconnect.");
    const media = await Promise.all(input.media.map(async (m) => ({ url: await m.publicUrl(24 * 3600), mimeType: m.mimeType, kind: m.kind, altText: m.altText, width: m.width, height: m.height })));
    const id = input.idempotencyKey ?? crypto.randomUUID();
    const res = (await this.send(
      url,
      input.accessToken,
      { event: "post.published", id, title: input.title ?? null, text: input.text, link: input.linkUrl ?? null, media, publishedAt: new Date().toISOString() },
      { ambiguous: true },
    )) as { id?: string; url?: string };
    return { externalPostId: typeof res.id === "string" && res.id ? res.id : id, url: typeof res.url === "string" ? res.url : null };
  }
}
