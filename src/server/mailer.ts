import "server-only";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends transactional email through Resend's HTTP API when RESEND_API_KEY is set.
 * In development without a key, the message (including links) is logged instead so the auth
 * flow stays testable. In production without a key, sending fails loudly.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    if (e.NODE_ENV === "production") throw new Error("Email delivery is not configured (RESEND_API_KEY missing)");
    logger.warn({ to: mail.to, subject: mail.subject, body: mail.text }, "email (dev, not sent)");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, "email delivery failed");
    throw new Error("Email delivery failed");
  }
}

export function actionEmail(title: string, intro: string, url: string, cta: string) {
  const text = `${intro}\n\n${cta}: ${url}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
<h2 style="margin:0 0 12px">${title}</h2><p>${intro}</p>
<p><a href="${url}" style="display:inline-block;background:#166534;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">${cta}</a></p>
<p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p></div>`;
  return { text, html };
}
