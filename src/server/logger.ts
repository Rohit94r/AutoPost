import "server-only";
import pino from "pino";

/**
 * Structured logger. Sensitive values are redacted by key name so tokens, secrets, passwords
 * and document text never reach log sinks even if accidentally included.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: process.env.FLOWT_SERVICE ?? (/worker/.test(process.argv[1] ?? "") ? "worker" : "web") },
  redact: {
    paths: [
      "*.accessToken",
      "*.refreshToken",
      "*.access_token",
      "*.refresh_token",
      "*.password",
      "*.secret",
      "*.clientSecret",
      "*.client_secret",
      "*.apiKey",
      "*.authorization",
      "*.Authorization",
      "*.cookie",
      "*.codeVerifier",
      "*.code_verifier",
      "*.extractedText",
      "*.prompt",
      "*.documentText",
    ],
    censor: "[redacted]",
  },
  ...(process.env.NODE_ENV === "development" && !process.env.FLOWT_JSON_LOGS
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }
    : {}),
});

export type Logger = typeof logger;
