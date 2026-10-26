import "server-only";
import { BaseAdapter, meta } from "./base";
import { platformFetch, readJson } from "./http";
import { PlatformError, type CredentialField, type PublishInput, type PublishResult } from "./types";

/**
 * Telegram channels via the Bot API. The bot (from @BotFather) must be an admin of the channel.
 * Docs: core.telegram.org/bots/api
 */
const API = "https://api.telegram.org";
const CAPTION_LIMIT = 1024;

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export class TelegramAdapter extends BaseAdapter {
  readonly platform = "telegram" as const;

  credentialFields(): CredentialField[] {
    return [
      { key: "botToken", label: "Bot token", type: "password", help: "Create a bot with @BotFather and paste its token.", required: true },
      { key: "chatId", label: "Channel", type: "text", placeholder: "@yourchannel or -100…", help: "Add the bot to the channel as an administrator first.", required: true },
    ];
  }

  private async call<T>(token: string, method: string, body: Record<string, unknown> | FormData, opts: { ambiguous?: boolean } = {}): Promise<T> {
    const isForm = body instanceof FormData;
    const res = await platformFetch(
      `${API}/bot${token}/${method}`,
      { method: "POST", headers: isForm ? undefined : { "Content-Type": "application/json" }, body: isForm ? body : JSON.stringify(body) },
      { timeoutMs: 120_000, ...opts },
    );
    const data = (await readJson(res)) as TgResponse<T>;
    if (data.ok && data.result !== undefined) return data.result;
    const msg = `Telegram: ${data.description ?? "request failed"}`;
    if (res.status === 401 || data.error_code === 401) throw new PlatformError("auth", "The bot token is invalid or was revoked. Reconnect.");
    if (res.status === 403 || data.error_code === 403) throw new PlatformError("permission", `${msg}. Make sure the bot is an admin of the channel.`);
    if (res.status === 429) throw new PlatformError("rate_limit", msg, { retryAfterSec: data.parameters?.retry_after ?? 30 });
    if (res.status >= 500) throw new PlatformError("transient", msg);
    throw new PlatformError("validation", msg);
  }

  async connectWithCredentials(values: Record<string, string>) {
    const token = (values.botToken ?? "").trim();
    const chatId = (values.chatId ?? "").trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new PlatformError("validation", "That doesn't look like a Telegram bot token.");
    if (!chatId) throw new PlatformError("validation", "Enter the channel username (@name) or id.");
    const bot = await this.call<{ id: number; username: string }>(token, "getMe", {});
    const chat = await this.call<{ id: number; title?: string; username?: string; type: string; photo?: unknown }>(token, "getChat", { chat_id: chatId });
    const member = await this.call<{ status: string; can_post_messages?: boolean }>(token, "getChatMember", { chat_id: chat.id, user_id: bot.id });
    const canPost = member.status === "administrator" || member.status === "creator";
    return {
      tokens: { accessToken: token, refreshToken: null, expiresAt: null, scopes: [] },
      profiles: [
        {
          externalId: String(chat.id),
          displayName: chat.title ?? chat.username ?? String(chat.id),
          username: chat.username ?? null,
          accountType: chat.type,
          eligible: canPost,
          eligibilityReason: canPost ? undefined : `Add @${bot.username} as an administrator of the channel with permission to post.`,
          metadata: { chatId: String(chat.id), chatUsername: chat.username ?? null, botUsername: bot.username },
        },
      ],
    };
  }

  private messageUrl(account: PublishInput["account"], messageId: number) {
    const username = meta(account, "chatUsername");
    if (username) return `https://t.me/${username}/${messageId}`;
    const id = meta(account, "chatId") ?? account.externalAccountId;
    return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${messageId}` : null;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const chatId = meta(input.account, "chatId") ?? input.account.externalAccountId;
    const m = input.media[0];
    let messageId: number;
    if (!m) {
      const r = await this.call<{ message_id: number }>(input.accessToken, "sendMessage", { chat_id: chatId, text: input.text, link_preview_options: { is_disabled: false } }, { ambiguous: true });
      messageId = r.message_id;
    } else {
      const fits = input.text.length <= CAPTION_LIMIT;
      const form = new FormData();
      form.append("chat_id", chatId);
      if (fits) form.append("caption", input.text);
      const field = m.kind === "video" ? "video" : "photo";
      form.append(field, new Blob([new Uint8Array(await m.load())], { type: m.mimeType }), m.kind === "video" ? "video.mp4" : "image.jpg");
      const r = await this.call<{ message_id: number }>(input.accessToken, m.kind === "video" ? "sendVideo" : "sendPhoto", form, { ambiguous: true });
      messageId = r.message_id;
      if (!fits) {
        // Captions are limited to 1024 characters: send the full text as a follow-up message.
        const t = await this.call<{ message_id: number }>(input.accessToken, "sendMessage", { chat_id: chatId, text: input.text, reply_parameters: { message_id: messageId } });
        messageId = t.message_id;
      }
    }
    return { externalPostId: String(messageId), url: this.messageUrl(input.account, messageId) };
  }
}
