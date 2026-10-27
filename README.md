# Verdant — AI-powered multi-platform social publishing

> **Create once → Understand the source → Generate → Customize per platform → Review → Publish or schedule → Track results.**

Verdant is a SaaS workspace where creators, student communities, founders, freelancers, marketing teams and agencies can turn an idea **or an uploaded document** (certificate, internship letter, event poster, competition result, project summary…) into accurate, natural posts, then adapt, preview, publish and schedule them to **15 platforms** (LinkedIn, Instagram, X, Facebook Pages, Threads, YouTube, TikTok, Pinterest, Reddit, Bluesky, Mastodon, Telegram, Discord, WordPress and any custom website) through official APIs. Every comment and mention then lands in **one inbox**, where you reply by hand or let **Autopilot** answer in your voice.

It is built as a real product, not a UI demo: PostgreSQL persistence, server-side sessions, encrypted OAuth credentials, Groq + Gemini AI adapters, document extraction with human review, a durable Redis/BullMQ publishing engine with idempotency and partial-success handling, honest analytics, quotas, audit logs and deployment docs.

---

## Table of contents

1. [Feature overview](#feature-overview)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Repository layout](#repository-layout)
5. [Quick start (local development)](#quick-start-local-development)
6. [Environment variables](#environment-variables)
7. [Scripts](#scripts)
8. [Platform setup (LinkedIn, Instagram, X)](#platform-setup)
9. [AI providers (Groq, Gemini)](#ai-providers)
10. [Publishing engine guarantees](#publishing-engine-guarantees)
11. [Security & privacy](#security--privacy)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Build stages & status](#build-stages--status)
15. [Known limitations](#known-limitations)

Detailed docs live in [`docs/`](docs/), including [Engagement](docs/ENGAGEMENT.md):
[Stage 0 audit](docs/STAGE-0-AUDIT.md) · [Platform API notes](docs/PLATFORM-API-NOTES.md) · [Architecture](docs/ARCHITECTURE.md) · [Setup](docs/SETUP.md) · [Platforms](docs/PLATFORMS.md) · [Deployment](docs/DEPLOYMENT.md) · [Security](docs/SECURITY.md) · [API](docs/API.md) · [Release checklist](docs/RELEASE-CHECKLIST.md)

---

## Feature overview

The app sidebar is organised around the work: **Create** (Dashboard, Create post, Apps ▾ with one page per connected app), **Engage** (Inbox with Comments + Autopilot), **Publish** (Calendar, Queue, History, Analytics) and **Workspace** (Accounts, Brand voice, Settings, Help).

| Module | What it does |
|---|---|
| **Auth & onboarding** | Email + password (with verification & reset), optional Google sign-in, DB-backed server sessions, onboarding wizard (workspace, time zone, brand voice). |
| **Workspaces** | Every record is workspace-scoped. Membership + role checks on every request; client-supplied IDs are never trusted. |
| **Social connections** | Official OAuth 2.0 for LinkedIn, Instagram (Instagram Login), X (PKCE). Single-use state, AES-256-GCM encrypted tokens, expiry & scope tracking, refresh, disconnect + revoke. |
| **Create post** | One place to write and publish: one post → editable per-platform variants, media, hashtags, CTA, links, publish now / schedule with time zone, live limit validation & previews. Built-in AI: generate per platform, improve, humanize, rewrite, shorten, expand, change tone, hashtags, quality check, before/after diff, brand voice. |
| **Start from a document** (in Create post) | Upload PDF/image → validate (MIME + magic bytes) → text extraction / Gemini OCR → document-type-aware fact extraction with confidence & evidence → **user review & correction** → content directions → platform drafts. |
| **AI images** (in Create post) | Image prompt + alt text from the post, image generation with Gemini, attached to the post in one click. |
| **Media** | Validated uploads, image metadata + thumbnails, reuse, deletion, per-platform media validation, signed public URLs for platforms that fetch media (Instagram). |
| **Publishing engine** | One job per destination account. Durable in Postgres, executed on Vercel by a once-a-minute scheduler (`/api/cron/tick`) or, self-hosted, by a persistent BullMQ worker. Idempotency keys, atomic claims, bounded exponential backoff, permanent-error detection, reconnection states, partial success, cancellation. |
| **Inbox → Comments** | Comments, replies and mentions from every supporting platform, linked to the post they're on. Reply from the web and it posts on the platform; AI-suggested replies. |
| **Inbox → Autopilot** | Rules (all / questions / keywords / mentions) that draft or auto-post replies in your brand voice, with daily caps and safety: spam and abuse are never answered, negatives go to review. |
| **Apps** | One page per connected app (sidebar → Apps ▾): account stats, likes / views / shares / comments, a 30-day posting chart, delivery success, autopilot status, every post with its metrics, and that app's comments with replies. |
| **Calendar & queue** | Month / week / agenda views, filters, drag-and-drop rescheduling, edit & cancel. |
| **History** | Every post you've made (drafts, published, AI-generated, templates, archived; search, tags, campaigns), the publishing log with each platform's real response and retry of failed destinations, and your media. |
| **Analytics** | Publishing analytics from our own data + platform metrics only where the API and granted scopes allow. Missing/unsupported metrics are labelled, never invented. |
| **Brand voice** | Multiple profiles: tone, audience, vocabulary, words to avoid, CTA/hashtag/emoji preferences, sample posts → derived style profile. |
| **Notifications** | In-app notifications for published / failed / partial posts, expiring connections, AI failures. |
| **Usage & plans** | Configurable plan limits enforced server-side (AI requests, documents, storage, accounts, publishing jobs). Billing-ready; **no fake payment flow**. |
| **Admin & ops** | Admin page (queue depth, failures, health), structured logs with correlation IDs, audit logs, data export & deletion. |

## Architecture

```
            ┌──────────────────────────── Browser ────────────────────────────┐
            │  Next.js App Router UI (React 19, Tailwind v4, Radix primitives) │
            └───────────────┬─────────────────────────────────────────────────┘
                            │ HTTPS (session cookie, CSRF-safe same-origin JSON)
┌───────────────────────────▼────────────────────────────────────────────────────┐
│ Next.js server (web)                                                           │
│  /api/auth/*  better-auth (sessions in Postgres)                               │
│  /api/v1/*    versioned REST: zod-validated, workspace-authorized, rate-limited│
│  services:    content · documents · media · ai · oauth · publishing · usage    │
└──────┬───────────────┬───────────────────┬───────────────────┬────────────────┘
       │               │                   │                   │
  PostgreSQL        Redis (BullMQ)     Object storage      AI providers
  (source of truth) (queues, rate      (local / S3 / R2)   Groq · Gemini
       ▲             limits)               ▲
       │               │                   │
┌──────┴───────────────▼───────────────────┴─────────────────────────────────────┐
│ Worker (persistent Node process)                                               │
│  publish queue · document queue · analytics queue · maintenance (sweeper:      │
│  recover due jobs after restarts, stuck-job detection, token refresh,          │
│  expiry notifications, retention cleanup)                                      │
└──────┬─────────────────────────────────────────────────────────────────────────┘
       ▼
 LinkedIn Posts API · Instagram Graph API · X API v2  (official endpoints only)
```

Key decisions (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **Postgres is the source of truth for schedules.** BullMQ delivers jobs on time, but the worker's sweeper re-enqueues any due job from Postgres, so schedules survive Redis flushes and worker restarts.
- **Atomic claim before publish.** A job row is moved to `processing` with a conditional `UPDATE … WHERE status IN (…)`. Cancelled, rescheduled or already-published jobs cannot be executed twice.
- **No blind re-publishing.** A job interrupted mid-publish (worker crash) is marked failed with "verify on platform" instead of being retried automatically.
- **Provider/adapter boundaries.** Business logic talks to `AIProvider` and `PlatformAdapter` interfaces only; new models/platforms plug in without rewrites.

## Tech stack

- **Web:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Radix UI, lucide icons, sonner toasts
- **Server:** Next.js route handlers, zod schemas, better-auth, Drizzle ORM + drizzle-kit migrations, pino logging
- **Jobs:** Redis + BullMQ 5, persistent worker (`tsx worker/index.ts` or compiled)
- **Storage:** local disk (dev) or any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) — private by default, signed URLs
- **AI:** `groq-sdk` (Groq), `@google/genai` (Gemini) behind a provider-independent layer
- **Docs/media:** `unpdf` (PDF text), Gemini multimodal (OCR/vision), `file-type` (magic bytes), `sharp` (image metadata/thumbnails)
- **Tests:** Vitest (unit + integration on in-process Postgres via PGlite), Playwright (E2E)

## Repository layout

```
.
├── src/
│   ├── app/                 # Next.js routes: marketing, auth, app pages, /api
│   ├── components/          # ui/ design system, layout/, feature components
│   ├── lib/                 # client-safe helpers (formatting, platform limits, fetcher)
│   └── server/              # server-only code
│       ├── ai/              # AIProvider, GroqProvider, GeminiProvider, ModelRegistry, PromptBuilder, …
│       ├── auth/            # better-auth config + session/workspace guards
│       ├── db/              # Drizzle client + schema
│       ├── documents/       # validation, text extraction, fact extraction pipeline
│       ├── platforms/       # linkedin/, instagram/, x/ adapters + limits + error taxonomy
│       ├── publishing/      # job creation, executor, retry policy, queue
│       ├── oauth/ media/ content/ analytics/ notifications/ usage/ audit/ storage/ http/
├── worker/                  # persistent background worker entrypoint
├── drizzle/                 # SQL migrations
├── tests/                   # unit/, integration/, e2e/
├── docs/                    # architecture, setup, platforms, deployment, security, API
├── docker-compose.yml       # local Postgres + Redis
└── .env.example
```

## Quick start (local development)

Prerequisites: **Node.js ≥ 20**, **pnpm ≥ 9**, and **Docker** (or hosted Postgres + Redis URLs).

```bash
pnpm install
cp .env.example .env.local          # fill in values — see below
docker compose up -d                # Postgres 17 + Redis 7 on localhost
pnpm db:migrate                     # apply migrations to a clean database
pnpm dev                            # web app on http://localhost:3000
pnpm worker                         # in a second terminal: background worker
```

Generate the two required secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
```

The app runs without social/AI credentials: features that need a missing credential are shown as **"Not configured"** instead of failing silently or faking results.

## Environment variables

See [`.env.example`](.env.example) for every variable with comments. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | worker mode | Redis for BullMQ + shared rate limiting (optional on Vercel) |
| `CRON_SECRET` | Vercel | Protects `/api/cron/tick`, the scheduler endpoint |
| `APP_BASE_URL` | ✅ | Public base URL (used for OAuth callbacks & signed media URLs) |
| `BETTER_AUTH_SECRET` | ✅ | Session signing secret (32+ random bytes) |
| `ENCRYPTION_KEY` | ✅ | Base64 32-byte key for AES-256-GCM token encryption |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | Verification & reset emails (logged to console in dev when unset) |
| `GROQ_API_KEY` | for AI | Groq text generation |
| `GEMINI_API_KEY` | for AI/docs | Gemini generation + document understanding |
| `AI_MODEL_*` | optional | Per-task model overrides (`provider:model`) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | for LinkedIn | LinkedIn app credentials |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | for Instagram | Instagram Login app credentials |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | for X | X OAuth 2.0 client |
| `STORAGE_DRIVER` + `S3_*` | optional | `local` (default) or `s3` |
| `ADMIN_EMAILS` | optional | Comma-separated emails allowed into `/admin` |

**Never** put secrets in `NEXT_PUBLIC_*` variables, source files or Git.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm worker` | Background worker (publishing, documents, analytics, maintenance) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + integration tests (Vitest) |
| `pnpm test:e2e` | Playwright end-to-end tests (needs running app + DB) |

## Platform setup

Full walkthrough with screenshots-in-words, scopes and approval notes: **[docs/PLATFORMS.md](docs/PLATFORMS.md)**.

OAuth callback URLs to register (replace the host for staging/production):

| Platform | Callback URL |
|---|---|
| LinkedIn | `{APP_BASE_URL}/api/v1/social-accounts/linkedin/callback` |
| Instagram | `{APP_BASE_URL}/api/v1/social-accounts/instagram/callback` |
| X | `{APP_BASE_URL}/api/v1/social-accounts/x/callback` |
| Google sign-in | `{APP_BASE_URL}/api/auth/callback/google` |

Important realities:

- **LinkedIn** member posting needs the *Share on LinkedIn* + *Sign In with LinkedIn using OpenID Connect* products. Organization posting needs *Community Management API* approval.
- **Instagram** publishing only works for **professional (Business/Creator) accounts**, requires app review for public use, and Instagram must be able to **fetch media from a public HTTPS URL** — so `APP_BASE_URL` (local storage) or your S3 bucket must be reachable from the internet.
- **X** write access and media upload depend on your API access tier and pricing; limits are surfaced, not bypassed.

## AI providers

- **Groq** handles fast drafting, rewriting, shortening/expanding, tone, hashtags and variants.
- **Gemini** handles document understanding (PDF + images/OCR), structured extraction, long-context generation and critique.
- Every task's model is configurable (`AI_MODEL_DRAFT=groq:<model>` etc.). Timeouts, bounded retries with backoff, usage tracking and request IDs are built in.
- Documents are **never silently sent to a different provider** on failure. Users are told which external provider processes their data.
- The Natural Writing Engine optimises for clarity, specificity and authenticity. It does **not** promise "AI-detector-proof" text and never invents achievements, dates, names or results.

## Publishing engine guarantees

- One `publishing_job` per (post variant × destination account), each tracked independently.
- `Idempotency-Key` header on job creation + a partial unique index prevent double-click duplicates.
- Times stored in UTC with the user's IANA time zone preserved.
- Retries: bounded exponential backoff for retryable errors (rate limits, 5xx, timeouts); permanent errors (validation, permission) fail immediately; revoked/expired tokens → `needs_reconnection`.
- Success is recorded **only after the platform API confirms** and returns an ID.
- Partial success is shown per destination; "Retry" re-runs only failed destinations.

## Security & privacy

AES-256-GCM encrypted tokens · server-only secrets · httpOnly secure session cookies · same-origin checks on mutations · zod validation everywhere · Drizzle parameterised queries · upload magic-byte validation · SSRF-safe outbound requests (allow-listed platform hosts) · prompt-injection fencing for document text · Redis-backed rate limits · security headers/CSP · audit logs · retention & deletion controls. Details: [docs/SECURITY.md](docs/SECURITY.md).

## Testing

```bash
pnpm test        # unit + integration (PGlite in-process Postgres, mocked platform/AI HTTP)
pnpm test:e2e    # Playwright against a running instance
```

Covered: auth guards, cross-workspace isolation, upload validation, AI response validation, provider timeouts, content-length/X weighted counting, OAuth state, token expiry, time zones/DST, worker recovery, duplicate prevention, rate limits, partial publication, retry classification, cancellation, analytics calculations, retention.

Automated tests **never** call real platform APIs or publish to real accounts.

## Deployment

**Vercel + Neon (recommended):** no extra servers. The `vercel-build` script migrates the database on production deploys, "Publish now" runs right after the request, and a scheduler calling `/api/cron/tick` every minute handles scheduled posts, comment sync and autopilot. Files upload straight to an S3-compatible bucket (Cloudflare R2). After the first deploy, sign in and open **Get started**: it walks each user through connecting their apps and shows admins exactly which settings are still missing.

**Self-hosted:** web (`pnpm start`) plus a persistent worker (`pnpm worker:prod`) with Redis.

Step-by-step guides for both: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Build stages & status

| Stage | Scope | Status |
|---|---|---|
| 0 | Repository audit & plan | ✅ [docs/STAGE-0-AUDIT.md](docs/STAGE-0-AUDIT.md) |
| 1 | Foundation: structure, design system, DB, auth, workspaces, config, logging | ✅ code + tests |
| 2 | Dashboard, composer, drafts, library, media, brand voice | ✅ |
| 3 | AI writing studio (Groq + Gemini) | ✅ mocked-provider tests · live keys pending |
| 4 | Document intelligence | ✅ · live Gemini run pending |
| 5 | Social OAuth integrations | ✅ · developer apps pending |
| 6 | Publishing engine | ✅ |
| 7 | Calendar, queue, notifications | ✅ |
| 8 | Analytics | ✅ calculations · live collection pending |
| 9 | Production hardening | ✅ |
| 10 | Release readiness | ✅ docs · launch checklist in [RELEASE-CHECKLIST](docs/RELEASE-CHECKLIST.md) |

Status in the checklist is only marked ✅ when the implementation **and tests** back it. Platform integrations are never called "production-ready" while credentials or platform approval are outstanding.

## Known limitations

- Real publishing requires your own developer apps, credentials and (for public use) platform app review.
- Instagram requires publicly reachable media URLs; localhost-only setups can connect accounts but cannot publish media.
- Platform analytics availability depends on granted scopes and account type; unsupported metrics are shown as such.
- No payment provider is integrated yet — plans are enforced, upgrades are manual/admin.
- Video thumbnails/duration probing need `ffprobe` and are not generated in this version.

## License

Proprietary — all rights reserved (change as appropriate).
