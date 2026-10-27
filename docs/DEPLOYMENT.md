# Deployment

FLOWT runs in one of two background modes:

- **cron** (Vercel and other serverless hosts): no extra process. "Publish now" and document reading run right after the request; scheduled posts, comment sync, autopilot, analytics and token refresh run from `/api/cron/tick`, which a scheduler calls every minute. This is the default on Vercel.
- **worker** (VPS, Render, Railway, Fly): a long-running `pnpm worker:prod` process with Redis (BullMQ). The default when `REDIS_URL` is set and the app isn't on Vercel.

Force a mode with `BACKGROUND_MODE=cron|worker`. Both need Postgres and, in production, S3-compatible storage.

## Option A: one VPS or VM (Docker)

```bash
docker build -t flowt .
docker run -d --name flowt-web    --env-file .env.production -p 3000:3000 flowt
docker run -d --name flowt-worker --env-file .env.production flowt pnpm worker:prod
docker run --rm --env-file .env.production flowt pnpm db:migrate   # before each release
```

Put Caddy or Nginx in front for HTTPS. Use managed Postgres and Redis, or the services in `docker-compose.yml` with volumes and backups.

## Option B: Render / Railway / Fly.io

| Service | Start command | Notes |
|---|---|---|
| Web | `pnpm start` | Build: `pnpm install --frozen-lockfile && pnpm build`. Health check `/api/health`. |
| Worker | `pnpm worker:prod` | "Background worker" service type, same env vars, ≥ 512 MB RAM |
| Release / pre-deploy | `pnpm db:migrate` | |

## Option C: Vercel (cron mode, nothing else to run)

1. **Database (Neon).** Create a project at neon.tech → **Connect**. Copy the connection string with pooling on (`DATABASE_URL`, host contains `-pooler`) and with pooling off (`DATABASE_URL_UNPOOLED`).
2. **File storage: nothing to do.** On Vercel, photos, videos and documents are stored in your Neon database (`stored_file_chunks`), uploaded and streamed in parts under Vercel's 4.5 MB request limit. Neon's free plan has 1 GB per project; **Get started → Server setup** shows how much files use. For heavy video use, switch to a bucket later: set `STORAGE_DRIVER=s3` with Cloudflare R2 or AWS S3, add a bucket CORS rule allowing `PUT` and `GET` from your domain, and a lifecycle rule deleting `uploads/` after 1 day.
3. **Secrets.** Generate three different values: `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) and `CRON_SECRET` (`…toString('hex')`). Keep an offline copy of `ENCRYPTION_KEY`.
4. **Import the repo in Vercel** (Framework: Next.js; leave the build command empty: the `vercel-build` script runs). Under **Settings → Environment Variables → Production**, add:

   | Variable | Value |
   |---|---|
   | `APP_BASE_URL` | `https://app.yourdomain.com` (your final domain, no trailing slash) |
   | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | from step 1 |
   | `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | from step 3 |
   | `GROQ_API_KEY`, `GEMINI_API_KEY` | AI providers |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `ADMIN_EMAILS` | your login (created on the first deploy only) |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Sign in with Google" (redirect URI `https://app.yourdomain.com/api/auth/callback/google`); also usable for YouTube |
   | `RESEND_API_KEY`, `EMAIL_FROM` | verification and password-reset emails (verify your domain in Resend) |
   | `REDIS_URL` | optional (Upstash `rediss://…`), for rate limits shared across instances |
   | platform keys | see [PLATFORMS.md](PLATFORMS.md) |

   Don't set `DATABASE_POOL_SIZE` (that's only for the local PGlite database).
5. **Deploy.** On production deploys the build applies migrations to Neon and creates your admin login if it doesn't exist (an existing password is never reset). Preview deploys never touch the database.
6. **Domain.** Add your domain under Settings → Domains. If it differs from `APP_BASE_URL`, fix the variable and redeploy.
7. **Scheduler.** Background work (scheduled posts, comment sync, autopilot) already runs while people use the app. For posts scheduled at quiet hours, add an every-minute scheduler. `vercel.json` ships a once-a-day cron (the most the Hobby plan allows).
   - **Pro:** change the schedule to `"* * * * *"` and redeploy. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
   - **Hobby:** create a free job at cron-job.org that calls `https://app.yourdomain.com/api/cron/tick` every minute with the header `Authorization: Bearer <CRON_SECRET>`.
8. **Sign in** and open **Get started**. The **Server setup** card (admins only) shows anything still missing and the exact redirect URL to register with each platform.

Limits to know: functions run for up to 300 s (Hobby and Pro), so very large videos to slow platforms may need Pro's longer limit; files up to `MEDIA_MAX_VIDEO_MB` upload in parts; rate limits are per instance unless `REDIS_URL` is set.

### How customers connect their accounts

You create **one developer app per platform** (once) and put its keys in Vercel. After that every customer just clicks **Connect** and signs in to their own Instagram, LinkedIn, X… account; they never handle API keys. Bluesky, Mastodon, Telegram, Discord, WordPress and Custom website need no keys from you: customers paste an app password, token or URL instead.

## Production checklist for env

- `APP_BASE_URL=https://…`. Don't set `NODE_ENV` for the web app (Next.js sets it); a self-hosted worker process needs `NODE_ENV=production`.
- `REQUIRE_EMAIL_VERIFICATION=true`, `RESEND_API_KEY`, `EMAIL_FROM`
- `STORAGE_DRIVER=s3` with a **private** bucket (no public ACLs). Instagram gets presigned URLs.
- Redis with `maxmemory-policy noeviction` (BullMQ requirement) and persistence (AOF)
- `ADMIN_EMAILS` set; `LOG_LEVEL=info`

## Scaling

- Web: stateless, so scale horizontally. Rate limits are shared through Redis.
- Worker: run 1+ replicas. The atomic Postgres claim guarantees each job runs once. Tune with `PUBLISH_CONCURRENCY` (default 5) and `DOCUMENT_CONCURRENCY` (default 2).
- Graceful shutdown: on SIGTERM the worker stops taking jobs and waits up to 30 s. A job killed mid-publish is marked `interrupted` by the next sweep and needs a human check.

## Backups & recovery

| Asset | Backup | Recovery |
|---|---|---|
| Postgres | Managed PITR (≥ 7 days), or nightly `pg_dump -Fc` to off-site storage | Restore, `pnpm db:migrate`, start the worker. The sweeper re-enqueues due jobs automatically. |
| Redis | AOF persistence (optional; it's not the source of truth) | Can be flushed safely. Due jobs are recovered from Postgres within 30 s. |
| `ENCRYPTION_KEY` | Secret manager, plus an offline copy held by two people | Without it, users must reconnect social accounts (tokens can't be decrypted). |
| Object storage | Bucket versioning or replication | Media re-download. Original documents expire by design (retention). |

Test a restore into staging at least quarterly.

## Monitoring

- Liveness and readiness: `GET /api/health` (DB and Redis).
- Logs: JSON (pino) on stdout. Every API response includes `x-request-id`, and publishing jobs carry `correlation_id` through queue, attempts and logs. Search by it.
- Sensitive keys (tokens, secrets, passwords, prompts, document text) are redacted by the logger.
- `/admin` shows queue depth, recent failures and AI latency. Alert on: health 503, a growing `failed` count, delayed-queue lag > 5 min.
- Optional: forward stdout to Datadog, Grafana Loki, Better Stack or Sentry (add an SDK in `instrumentation.ts`).
