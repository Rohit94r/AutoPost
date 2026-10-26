# Environment setup

## 1. Prerequisites

- Node.js 20.11+ (22 LTS recommended) and pnpm 10 (`corepack enable`)
- PostgreSQL 15+ and Redis 7+. Use local installs, Docker (`docker compose up -d`), or hosted services such as Neon, Supabase, Railway, Upstash or Redis Cloud.

## 2. Install & configure

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Your Postgres connection string. Use the *direct* (non-pooled) URL for migrations; add `?pgbouncer=true` when going through PgBouncer. |
| `REDIS_URL` | `redis://…` or `rediss://…` (TLS). Upstash: use the "ioredis" connection string. |
| `BETTER_AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ENCRYPTION_KEY` | Same command, using a **different** value. Back it up: losing it means every account must reconnect. |
| `APP_BASE_URL` | `http://localhost:3000` locally; your public HTTPS URL in staging/production. |
| `ADMIN_EMAILS` | Your email, to open `/admin`. |

### Neon (hosted Postgres, recommended)

1. In the Neon console open your project → **Connect**. Copy the connection string twice: once with **Connection pooling** on, once with it off.
2. In `.env.local` (or your host's environment):

```
DATABASE_URL=postgresql://…@ep-xxxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL_UNPOOLED=postgresql://…@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

3. Remove `DATABASE_POOL_SIZE` (it's only for the local PGlite database), then run `pnpm db:migrate` and `pnpm db:seed`.

Paste the strings exactly as Neon shows them. The app removes client-only options such as `channel_binding` before connecting (the Postgres driver would otherwise send them to the server, which rejects them), verifies Neon's TLS certificate, and turns off prepared statements on the pooled endpoint. Migrations use the direct URL. A Neon compute that scaled to zero wakes on the first query, which can take a few seconds.

### No Docker? Use the built-in local database

```bash
pnpm db:local   # Postgres (PGlite) on 127.0.0.1:5433, data in ~/.verdant/pglite
```

Then set in `.env.local`:

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
DATABASE_POOL_SIZE=1   # PGlite serves one connection reliably
# REDIS_URL left unset: web app works; scheduled publishing needs Redis + the worker
```

For production, use real Postgres and remove `DATABASE_POOL_SIZE`.

## 3. Database

```bash
pnpm db:migrate        # applies drizzle/*.sql to a clean database
pnpm db:seed           # creates the login from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

`db:seed` creates a verified, onboarded account with its own workspace (run it again to reset the password). Keep the values in `.env.local` only, and add the email to `ADMIN_EMAILS` to open `/admin`.

After changing `src/server/db/schema/index.ts`, run `pnpm db:generate --name <change>` to create a new migration. Commit it, then run `pnpm db:migrate` in each environment. Never edit applied migrations.

## 4. Run

```bash
pnpm dev       # terminal 1 → http://localhost:3000
pnpm worker    # terminal 2 → publishing, documents, analytics, maintenance
```

Without Redis, the web app still works (rate limits fall back to in-memory, and in development document extraction runs inline). Scheduled publishing **requires** the worker, and the worker requires Redis.

## 5. AI providers

| Provider | Steps |
|---|---|
| Groq | console.groq.com → API Keys → `GROQ_API_KEY` |
| Gemini | aistudio.google.com → Get API key → `GEMINI_API_KEY` |

Per-task overrides use the format `AI_MODEL_<TASK>=provider:model` (tasks: DRAFT, ADAPT, REWRITE, HASHTAGS, EXTRACT, CRITIQUE, VOICE). Check current model IDs before changing them (see [PLATFORM-API-NOTES.md](PLATFORM-API-NOTES.md)).

## 6. Email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender domain in Resend). Without a key, development logs verification and reset links to the server console, and production refuses to start sending. Set `REQUIRE_EMAIL_VERIFICATION=true` in production.

## 7. Google sign-in (optional)

Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
- Authorized redirect URI: `{APP_BASE_URL}/api/auth/callback/google`
- Put the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 8. Social platforms

See [PLATFORMS.md](PLATFORMS.md).

## 9. Development / staging / production credentials

- Use **separate** platform apps (or at least separate redirect URIs) and separate API keys per environment.
- Store secrets in your host's secret manager (Vercel/Render/Railway/Fly env settings, AWS Secrets Manager, Doppler…), not in files or images.
- Never paste production secrets into source files, issues, chat tools or `NEXT_PUBLIC_*` variables.
- Rotate `ENCRYPTION_KEY` by setting the new key in `ENCRYPTION_KEY` and the old one in `ENCRYPTION_KEY_PREVIOUS`. Values are re-encrypted with the new key on the next token refresh or reconnect.

## 10. Tests

```bash
pnpm test        # unit + integration (no external services needed)
pnpm test:e2e    # needs a running app + migrated database
```
