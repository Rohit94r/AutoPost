# Deployment

Verdant needs **two long-running processes** (web and worker) plus Postgres, Redis and (in production) S3-compatible storage. Never run the worker as a serverless function or cron. It must run continuously.

## Option A: one VPS or VM (Docker)

```bash
docker build -t verdant .
docker run -d --name verdant-web    --env-file .env.production -p 3000:3000 verdant
docker run -d --name verdant-worker --env-file .env.production verdant pnpm worker:prod
docker run --rm --env-file .env.production verdant pnpm db:migrate   # before each release
```

Put Caddy or Nginx in front for HTTPS. Use managed Postgres and Redis, or the services in `docker-compose.yml` with volumes and backups.

## Option B: Render / Railway / Fly.io

| Service | Start command | Notes |
|---|---|---|
| Web | `pnpm start` | Build: `pnpm install --frozen-lockfile && pnpm build`. Health check `/api/health`. |
| Worker | `pnpm worker:prod` | "Background worker" service type, same env vars, ≥ 512 MB RAM |
| Release / pre-deploy | `pnpm db:migrate` | |

## Option C: Vercel (web) + separate worker host

The web app runs well on Vercel. The worker **must** run elsewhere (Render worker, Railway, Fly machine, a small VM). Both point to the same `DATABASE_URL`, `REDIS_URL` and `ENCRYPTION_KEY`. On Vercel:
- set `STORAGE_DRIVER=s3` (the serverless filesystem is ephemeral);
- uploads go through route handlers, so keep `MEDIA_MAX_VIDEO_MB` within your plan's request body limit, or front large uploads with your own direct-to-S3 flow.

## Production checklist for env

- `NODE_ENV=production`, `APP_BASE_URL=https://…`
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
