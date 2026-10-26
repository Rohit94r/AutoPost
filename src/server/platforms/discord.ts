import "server-only";
import { BaseAdapter, meta } from "./base";
import { platformFetch, readJson, retryAfterFrom } from "./http";
import { PlatformError, type CredentialField, type PublishInput, type PublishResult } from "./types";

/**
 * Discord channel webhooks. The webhook URL itself is the secret, so it is stored encrypted as
 * the access token. Docs: discord.com/developers/docs/resources/webhook#execute-webhook
 */
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)$/;

export class DiscordAdapter extends BaseAdapter {
  readonly platform = "discord" as const;

  credentialFields(): CredentialField[] {
    return [{ key: "webhookUrl", label: "Webhook URL", type: "password", help: "Channel settings → Integrations → Webhooks → New webhook → Copy URL.", required: true }];
  }

  private async fail(res: Response): Promise<never> {
    const body = (await readJson(res)) as { message?: string };
    const msg = `Discord: ${body.message ?? "request failed"}`;
    if (res.status === 401 || res.status === 404) throw new PlatformError("auth", "The Discord webhook was deleted or is invalid. Reconnect with a new webhook URL.");
    if (res.status === 403) throw new PlatformError("permission", msg);
    if (res.status === 429) throw new PlatformError("rate_limit", msg, { retryAfterSec: retryAfterFrom(res, 5) });
    if (res.status >= 500) throw new PlatformError("transient", msg);
    throw new PlatformError("validation", msg);
  }

  async connectWithCredentials(values: Record<string, string>) {
    const url = (values.webhookUrl ?? "").trim();
    const m = WEBHOOK_RE.exec(url);
    if (!m) throw new PlatformError("validation", "That isn't a Discord webhook URL.");
    const res = await platformFetch(url, {});
    if (!res.ok) await this.fail(res);
    const hook = (await readJson(res)) as { id: string; name?: string; channel_id: string; guild_id?: string; avatar?: string | null };
    return {
      tokens: { accessToken: url, refreshToken: null, expiresAt: null, scopes: [] },
      profiles: [
        {
          externalId: hook.id,
          displayName: hook.name ?? "Discord webhook",
          username: `#${hook.channel_id}`,
          accountType: "webhook",
          eligible: true,
          metadata: { channelId: hook.channel_id, guildId: hook.guild_id ?? null },
        },
      ],
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const url = `${input.accessToken}?wait=true`;
    const payload = { content: input.text.slice(0, 2000), allowed_mentions: { parse: [] as string[] } };
    let res: Response;
    if (input.media.length) {
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      for (const [i, m] of input.media.entries()) {
        form.append(`files[${i}]`, new Blob([new Uint8Array(await m.load())], { type: m.mimeType }), m.kind === "video" ? `video-${i}.mp4` : `image-${i}.jpg`);
      }
      res = await platformFetch(url, { method: "POST", body: form, signal: input.signal }, { ambiguous: true, timeoutMs: 120_000 });
    } else {
      res = await platformFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, { ambiguous: true });
    }
    if (!res.ok) await this.fail(res);
    const msg = (await readJson(res)) as { id?: string; channel_id?: string };
    if (!msg.id) throw new PlatformError("ambiguous", "Discord didn't return a message id. Check the channel before retrying.");
    const guild = meta(input.account, "guildId");
    return { externalPostId: msg.id, url: guild && msg.channel_id ? `https://discord.com/channels/${guild}/${msg.channel_id}/${msg.id}` : null };
  }
}
