import "server-only";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { db } from "@/server/db";
import { autoReplyRules, brandProfiles, contentItems, engagementItems, publishingJobs, socialAccounts, storedFileChunks, users } from "@/server/db/schema";
import { backgroundMode, env, onVercel, storageDriver, storageProblem } from "@/server/env";
import { lastExternalTickAt } from "@/server/jobs/runner";
import { getAdapter } from "@/server/platforms/registry";

export const SETUP_STEPS = ["brand", "apps", "post", "publish", "autopilot", "inbox"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** Skip ids: a step, one app ("app:linkedin") or one server check ("server:storage"). */
export const SKIP_ID = /^(brand|apps|post|publish|autopilot|inbox|app:[a-z]+|server:[a-z_]+)$/;

export interface SetupProgress {
  steps: { id: SetupStepId; done: boolean; skipped: boolean }[];
  connected: Platform[];
  skipped: string[];
  hidden: boolean;
  remaining: number;
}

/** What the signed-in user has done so far in the Get started guide. */
export async function setupProgress(userId: string, workspaceId: string): Promise<SetupProgress> {
  const one = <T>(rows: T[]) => rows[0];
  const [u, brand, accounts, posts, jobs, rules, replied] = await Promise.all([
    db.select({ setupState: users.setupState }).from(users).where(eq(users.id, userId)).then(one),
    db.select({ description: brandProfiles.description, audience: brandProfiles.audience, examplePosts: brandProfiles.examplePosts }).from(brandProfiles).where(and(eq(brandProfiles.workspaceId, workspaceId), eq(brandProfiles.isDefault, true))).then(one),
    db.selectDistinct({ platform: socialAccounts.platform }).from(socialAccounts).where(and(eq(socialAccounts.workspaceId, workspaceId), ne(socialAccounts.status, "disconnected"))),
    db.select({ n: count() }).from(contentItems).where(eq(contentItems.workspaceId, workspaceId)).then(one),
    db.select({ n: count() }).from(publishingJobs).where(eq(publishingJobs.workspaceId, workspaceId)).then(one),
    db.select({ n: count() }).from(autoReplyRules).where(eq(autoReplyRules.workspaceId, workspaceId)).then(one),
    db.select({ n: count() }).from(engagementItems).where(and(eq(engagementItems.workspaceId, workspaceId), eq(engagementItems.status, "replied"))).then(one),
  ]);
  const skipped = u?.setupState.skipped ?? [];
  const done: Record<SetupStepId, boolean> = {
    brand: Boolean(brand && (brand.description || brand.audience || brand.examplePosts.length)),
    apps: accounts.length > 0,
    post: (posts?.n ?? 0) > 0,
    publish: (jobs?.n ?? 0) > 0,
    autopilot: (rules?.n ?? 0) > 0,
    inbox: (replied?.n ?? 0) > 0,
  };
  const steps = SETUP_STEPS.map((id) => ({ id, done: done[id], skipped: !done[id] && skipped.includes(id) }));
  return {
    steps,
    connected: accounts.map((a) => a.platform),
    skipped,
    hidden: Boolean(u?.setupState.hiddenAt),
    remaining: steps.filter((s) => !s.done && !s.skipped).length,
  };
}

export async function updateSetupState(userId: string, change: { skip?: string; unskip?: string; hidden?: boolean }) {
  const [u] = await db.select({ setupState: users.setupState }).from(users).where(eq(users.id, userId));
  const state = { ...(u?.setupState ?? {}) };
  const skipped = new Set(state.skipped ?? []);
  if (change.skip) skipped.add(change.skip);
  if (change.unskip) skipped.delete(change.unskip);
  state.skipped = [...skipped];
  if (change.hidden !== undefined) state.hiddenAt = change.hidden ? new Date().toISOString() : undefined;
  await db.update(users).set({ setupState: state }).where(eq(users.id, userId));
}

export interface ServerCheck {
  id: string;
  label: string;
  /** "optional" checks never block anything. */
  required: boolean;
  ok: boolean;
  detail: string;
  steps: string[];
  envKeys: string[];
}

/** Server configuration status for the operator (admins only). Never includes secret values. */
export async function serverChecks(): Promise<ServerCheck[]> {
  const e = env();
  const base = e.APP_BASE_URL;
  const mode = backgroundMode();
  const last = mode === "cron" ? await lastExternalTickAt() : null;
  const tickFresh = last !== null && Date.now() - last.getTime() < 15 * 60_000;
  const storage = storageProblem();
  const driver = storageDriver();
  const usedMb =
    driver === "database"
      ? await db
          .select({ bytes: sql<string>`coalesce(sum(octet_length(${storedFileChunks.data})), 0)::text` })
          .from(storedFileChunks)
          .then((r) => Math.round(Number(r[0]?.bytes ?? 0) / 1024 / 1024))
      : null;
  const https = base.startsWith("https://");
  const checks: ServerCheck[] = [
    {
      id: "url",
      label: "Public app address",
      required: true,
      ok: https || e.NODE_ENV !== "production",
      detail: `APP_BASE_URL is ${base}. Platforms send people back here after they sign in, so it must be your real HTTPS domain.`,
      steps: ["In Vercel → Project → Settings → Environment Variables, set APP_BASE_URL to your domain, e.g. https://app.yourdomain.com (no trailing slash).", "Redeploy. Then register the redirect URLs shown for each platform below."],
      envKeys: ["APP_BASE_URL"],
    },
    {
      id: "ai",
      label: "AI writing (Groq)",
      required: true,
      ok: Boolean(e.GROQ_API_KEY),
      detail: "Writes and rewrites posts, hashtags and comment replies.",
      steps: ["Go to console.groq.com → API Keys → Create API Key.", "Add it as GROQ_API_KEY in Vercel and redeploy."],
      envKeys: ["GROQ_API_KEY"],
    },
    {
      id: "gemini",
      label: "AI documents and images (Gemini)",
      required: true,
      ok: Boolean(e.GEMINI_API_KEY),
      detail: "Reads certificates and posters, and creates images.",
      steps: ["Go to aistudio.google.com → Get API key → Create API key.", "Add it as GEMINI_API_KEY in Vercel and redeploy."],
      envKeys: ["GEMINI_API_KEY"],
    },
    {
      id: "storage",
      label: "File storage",
      required: true,
      ok: storage === null,
      detail:
        storage ??
        (driver === "database"
          ? `Photos, videos and documents are stored in your database (Neon), so there's nothing extra to set up. Files use ${usedMb} MB. Neon's free plan has 1 GB per project; for lots of video, switch to a bucket (steps below).`
          : driver === "s3"
            ? `Uploads go to the S3 bucket ${e.S3_BUCKET}.`
            : "Uploads are saved on this server's disk."),
      steps: [
        "Nothing to do on Vercel: files go into your database by default.",
        "Optional, for heavy video use: move files to a bucket. Cloudflare R2 (10 GB free) works:",
        "Cloudflare R2 (10 GB free): Cloudflare dashboard → R2 → Create bucket (keep it private).",
        "R2 → Manage API tokens → Create API token with Object Read & Write for that bucket. Copy the Access Key ID, Secret Access Key and the S3 endpoint.",
        "Set STORAGE_DRIVER=s3, S3_BUCKET, S3_ENDPOINT (https://<account-id>.r2.cloudflarestorage.com), S3_REGION=auto, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY. Redeploy.",
        `Bucket → Settings → CORS policy, so browsers can upload straight to it: [{"AllowedOrigins":["${base}"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]`,
        "Bucket → Settings → Object lifecycle rules: delete objects with prefix uploads/ after 1 day (unfinished uploads).",
      ],
      envKeys: ["STORAGE_DRIVER", "S3_BUCKET", "S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    },
    mode === "cron"
      ? {
          id: "scheduler",
          label: "Scheduler (scheduled posts, inbox sync, autopilot)",
          required: true,
          ok: Boolean(e.CRON_SECRET) && tickFresh,
          detail: !e.CRON_SECRET
            ? "Scheduled posts, comment sync and autopilot run while people use the app. CRON_SECRET isn't set, so nothing runs when nobody is using it."
            : last
              ? `The every-minute scheduler last ran ${Math.round((Date.now() - last.getTime()) / 60_000)} min ago${tickFresh ? "." : ". Until it runs again, work only happens while people use the app."}`
              : "Background work runs while people use the app. Add the every-minute scheduler so scheduled posts also go out when nobody is using it.",
          steps: [
            "Create a long random secret and add it as CRON_SECRET in Vercel. Redeploy.",
            "Vercel Pro: in vercel.json change the cron schedule to \"* * * * *\" and redeploy. Vercel calls the scheduler every minute with the secret.",
            `Vercel Hobby (cron runs only once a day): at cron-job.org create a free job that calls ${base}/api/cron/tick every minute, with the header Authorization: Bearer <your CRON_SECRET>.`,
            "\"Publish now\" works without the scheduler; scheduled posts, comment sync and autopilot need it.",
          ],
          envKeys: ["CRON_SECRET"],
        }
      : {
          id: "scheduler",
          label: "Background worker",
          required: true,
          ok: Boolean(e.REDIS_URL),
          detail: e.REDIS_URL ? "Redis is configured. Keep `pnpm worker:prod` running." : "REDIS_URL isn't set, so the worker can't start.",
          steps: ["Create a Redis database (for example Upstash) and set REDIS_URL.", "Run `pnpm worker:prod` as a long-running process next to the web app."],
          envKeys: ["REDIS_URL"],
        },
    {
      id: "google",
      label: "Sign in with Google",
      required: false,
      ok: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
      detail: `Lets customers sign up with one click. Authorized redirect URI: ${base}/api/auth/callback/google. The same Google client can also connect YouTube.`,
      steps: [
        "Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.",
        `Authorized redirect URIs: ${base}/api/auth/callback/google (and ${base}/api/v1/social-accounts/youtube/callback if you'll use YouTube).`,
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Publish the OAuth consent screen so any Google account can sign in. Redeploy.",
      ],
      envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    },
    {
      id: "email",
      label: "Email (sign-up verification, password reset)",
      required: false,
      ok: Boolean(e.RESEND_API_KEY),
      detail: e.RESEND_API_KEY ? `Sending as ${e.EMAIL_FROM}.` : "Without it, password-reset emails can't be sent.",
      steps: ["At resend.com add and verify your domain, then create an API key.", "Set RESEND_API_KEY and EMAIL_FROM (e.g. Verdant <no-reply@yourdomain.com>). Redeploy."],
      envKeys: ["RESEND_API_KEY", "EMAIL_FROM"],
    },
    {
      id: "redis",
      label: "Shared rate limits (Redis)",
      required: false,
      ok: Boolean(e.REDIS_URL),
      detail: onVercel() ? "Optional on Vercel. Without it, rate limits are counted per server instance." : "Used for rate limits and the worker queue.",
      steps: ["Create a free Redis database at upstash.com and copy its rediss:// URL.", "Set REDIS_URL and redeploy."],
      envKeys: ["REDIS_URL"],
    },
  ];
  return checks;
}

/** Developer-app status for every OAuth platform, with the exact redirect URL to register. */
export function platformServerStatus() {
  const base = env().APP_BASE_URL;
  return PLATFORMS.map((p) => ({ platform: p, configured: getAdapter(p).isConfigured(), redirectUrl: `${base}/api/v1/social-accounts/${p}/callback` }));
}
