import "server-only";
import { z } from "zod";

/**
 * Server-side configuration. Parsed lazily so `next build` does not need runtime secrets.
 * Never import this module from client components — `server-only` enforces that.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: optional,
  // How background work runs: "worker" = BullMQ worker process (needs REDIS_URL);
  // "cron" = /api/cron/tick called by a scheduler (Vercel and other serverless hosts).
  // Default: cron on Vercel, worker when REDIS_URL is set, otherwise cron.
  BACKGROUND_MODE: z.enum(["worker", "cron"]).optional().or(z.literal("").transform(() => undefined)),
  // Shared secret the scheduler sends as "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends it automatically).
  CRON_SECRET: optional,

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  ENCRYPTION_KEY_PREVIOUS: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Verdant <no-reply@localhost>"),
  REQUIRE_EMAIL_VERIFICATION: bool(false),

  GROQ_API_KEY: optional,
  GEMINI_API_KEY: optional,
  AI_MODEL_DRAFT: optional,
  AI_MODEL_REWRITE: optional,
  AI_MODEL_ADAPT: optional,
  AI_MODEL_HASHTAGS: optional,
  AI_MODEL_EXTRACT: optional,
  AI_MODEL_CRITIQUE: optional,
  AI_MODEL_VOICE: optional,
  AI_MODEL_REPLY: optional,
  // Optional image generation, e.g. gemini:<image-capable model id>. Unset = image prompts only.
  AI_MODEL_IMAGE: optional,
  AI_MODEL_FALLBACK: optional,
  AI_TIMEOUT_MS: int(45_000),
  AI_MAX_RETRIES: int(2),

  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/).default("202610"),
  LINKEDIN_ENABLE_ORGANIZATIONS: bool(false),

  INSTAGRAM_APP_ID: optional,
  INSTAGRAM_APP_SECRET: optional,
  INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  // Request instagram_business_manage_insights (must be enabled on the Meta app, else login fails).
  INSTAGRAM_REQUEST_INSIGHTS: bool(true),
  // Request instagram_business_manage_comments (needed for the inbox / autopilot).
  INSTAGRAM_REQUEST_COMMENTS: bool(true),

  FACEBOOK_APP_ID: optional,
  FACEBOOK_APP_SECRET: optional,
  FACEBOOK_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),

  THREADS_APP_ID: optional,
  THREADS_APP_SECRET: optional,

  // YouTube uses a Google OAuth client (can be the same project as Google sign-in).
  YOUTUBE_CLIENT_ID: optional,
  YOUTUBE_CLIENT_SECRET: optional,

  TIKTOK_CLIENT_KEY: optional,
  TIKTOK_CLIENT_SECRET: optional,

  PINTEREST_APP_ID: optional,
  PINTEREST_APP_SECRET: optional,

  REDDIT_CLIENT_ID: optional,
  REDDIT_CLIENT_SECRET: optional,
  // Reddit requires a descriptive User-Agent including your Reddit username.
  REDDIT_USERNAME: optional,

  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,
  X_MAX_POST_LENGTH: int(280),
  ANALYTICS_X_ENABLED: bool(false),
  // Reading X replies/mentions is billed per post read; opt in deliberately.
  ENGAGEMENT_X_ENABLED: bool(false),
  ENGAGEMENT_SYNC_MINUTES: int(15),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: optional,
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: bool(false),

  MEDIA_MAX_IMAGE_MB: int(8),
  MEDIA_MAX_VIDEO_MB: int(200),
  DOCUMENT_MAX_MB: int(15),
  DOCUMENT_RETENTION_DAYS: int(30),

  // Shown on Terms / Privacy pages and in app-review submissions.
  LEGAL_ENTITY_NAME: z.string().default("Verdant"),
  SUPPORT_EMAIL: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  LEGAL_JURISDICTION: z.string().default("the jurisdiction where the operator is established"),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) : [])),
  DEFAULT_PLAN: z.enum(["free", "pro", "team"]).default("free"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // On Vercel, fall back to the production domain when APP_BASE_URL isn't set.
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const source = { ...process.env, APP_BASE_URL: process.env.APP_BASE_URL || (vercelUrl ? `https://${vercelUrl}` : undefined) };
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env().NODE_ENV === "production";

/** Running on Vercel (or another host where no long-lived worker process exists). */
export const onVercel = () => process.env.VERCEL === "1";

export function backgroundMode(): "worker" | "cron" {
  const e = env();
  return e.BACKGROUND_MODE ?? (onVercel() ? "cron" : e.REDIS_URL ? "worker" : "cron");
}

/** Why uploads can't be stored, or null when storage is usable. */
export function storageProblem(): string | null {
  const e = env();
  if (e.STORAGE_DRIVER === "s3") return e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY ? null : "S3 storage is selected but S3_BUCKET, S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is missing.";
  if (onVercel()) return "Vercel has no persistent disk. Set STORAGE_DRIVER=s3 with an S3-compatible bucket (Cloudflare R2, AWS S3) to store uploads.";
  return null;
}

export function integrationStatus() {
  const e = env();
  return {
    groq: Boolean(e.GROQ_API_KEY),
    gemini: Boolean(e.GEMINI_API_KEY),
    linkedin: Boolean(e.LINKEDIN_CLIENT_ID && e.LINKEDIN_CLIENT_SECRET),
    instagram: Boolean(e.INSTAGRAM_APP_ID && e.INSTAGRAM_APP_SECRET),
    x: Boolean(e.X_CLIENT_ID && e.X_CLIENT_SECRET),
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    email: Boolean(e.RESEND_API_KEY),
    redis: Boolean(e.REDIS_URL),
    s3: e.STORAGE_DRIVER === "s3",
    storage: storageProblem() === null,
  };
}
