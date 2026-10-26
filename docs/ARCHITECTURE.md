# Architecture

## Processes

| Process | Command | Responsibilities |
|---|---|---|
| **web** | `pnpm start` (Next.js) | UI, `/api/auth/*` (better-auth), `/api/v1/*` REST, OAuth callbacks, signed media delivery |
| **worker** | `pnpm worker:prod` | Publishing execution, document extraction, metrics collection, token maintenance, retention, recovery sweeps |
| **PostgreSQL** | managed | Source of truth for everything, including schedules |
| **Redis** | managed | BullMQ queues + shared rate-limit counters |

## Module map (`src/server`)

| Module | Key exports |
|---|---|
| `env.ts` | Lazy zod-validated config, `integrationStatus()` |
| `db/` | Drizzle schema, lazy `db` proxy, `setDbForTesting` |
| `auth/` | better-auth instance, `requirePageContext`, `requireApiContext` (session + workspace resolution) |
| `http/handler.ts` | `apiRoute()` wrapper: same-origin check → auth/role → rate limit → handler → error mapping, `x-request-id` |
| `http/idempotency.ts` | `Idempotency-Key` storage and replay |
| `crypto/` | AES-256-GCM `encrypt/decrypt` with key IDs, HMAC signing |
| `ai/` | `AIProvider`, `GroqProvider`, `GeminiProvider`, `ModelRegistry`, `PromptBuilder` (`prompt-builder.ts`), `runTask` (retries/validation/usage), `content-generator.ts` (ContentGenerator / ContentRewriter / PlatformAdapter / voice / critique) |
| `platforms/` | `PlatformAdapter` interface, `LinkedInAdapter`, `InstagramAdapter`, `XAdapter`, error taxonomy, SSRF-guarded HTTP |
| `oauth/` | State + PKCE, token exchange, encrypted credential storage, refresh, disconnect |
| `publishing/` | Job creation (preflight, idempotency, UTC/time zone), executor (atomic claim, attempts, outcome), retry policy (pure) |
| `documents/` | Upload validation, PDF text / OCR / vision extraction, review, retention purge |
| `media/` | Magic-byte validation, thumbnails, platform media preparation (JPEG conversion for Instagram) |
| `content/` | Drafts, variants, library queries, status rollup (pure `rollupStatus`) |
| `analytics/` | Publishing summary (own data), platform metrics (latest snapshot per metric), collection |
| `usage/`, `notifications/`, `audit.ts`, `maintenance.ts`, `admin/` | Quotas, in-app notifications, audit trail, worker housekeeping, ops overview |

Client-safe shared logic lives in `src/lib` (platform limits, X weighted counting, quality checker, time zones, plans, diff).

## Publishing lifecycle

```
Composer ──POST /publishing-jobs (Idempotency-Key)──▶ preflight (all destinations valid?)
   │                                                  │ quota check
   │                                                  ▼
   │                       INSERT publishing_jobs (one per account)  ← partial unique index blocks duplicates
   │                                                  │
   │                       BullMQ delayed job (jobId = pub-<id>-<scheduledAtMs>)
   ▼                                                  ▼
Worker ── claimJob: UPDATE … SET status='processing' WHERE id=? AND due AND status IN (queued,scheduled)
              │ (0 rows → cancelled / rescheduled / already done → skip)
              ▼
         insert publishing_attempts(n) → freeze payload_snapshot → token (refresh if needed)
              ▼
         adapter.publish()  ── success ──▶ status=published + external id/url + published_posts  (only after platform id)
              │
              └─ error ─▶ decideOutcome():
                    transient/rate_limit → queued + next_retry_at (exp. backoff, Retry-After)
                    auth                 → needs_reconnection (+ account expired, notify)
                    validation/permission/media → failed (permanent)
                    ambiguous            → failed (code=ambiguous, needs user confirmation to retry)
              ▼
         refreshContentStatus() → draft/scheduled/publishing/published/partially_published/failed/cancelled
```

**Recovery:** every 30 s the sweeper re-enqueues due jobs from Postgres (survives Redis loss/restarts) and fails jobs stuck in `processing` for more than 15 min as `interrupted` (never auto-retried).

## Analytics

- **Publishing analytics:** computed from `publishing_jobs` / `published_posts`. Success rate = `published / (published + failed)`, where `failed` includes `needs_reconnection`. Cancelled and pending jobs are excluded; the rate is null when there's no data.
- **Platform metrics:** snapshots in `post_analytics`, each with `availability` (`available | unsupported | permission_missing | unavailable`) and a note. Totals only sum `available` values and report how many posts lacked data.
- **Engagement rate:** Σ interactions / Σ exposure, over posts that report both an exposure metric (impressions, else views, else reach) and at least one interaction metric. Null otherwise. Implemented in `src/lib/analytics.ts` and unit-tested.

## AI pipeline

`runTask` → quota → `ModelRegistry.resolve(task)` → provider call with per-attempt timeout and bounded exponential backoff → loose JSON parse → zod validation (one repair round) → optional configured fallback (**never** for `extract`) → `ai_generation_jobs` log + usage records. Output passes through `checkQuality` (limits, clichés, avoid list, emoji/hashtag preferences, unsupported numbers vs source).

Prompt injection: untrusted text (ideas, drafts, documents, samples) is wrapped in `<untrusted_*>` fences, with fence tags stripped from the content. The system prompt tells the model to treat fenced text as data. The extractor also reports `embeddedInstructionsDetected`.

## Multi-tenancy

Every domain row carries `workspace_id`. Every service query filters by the workspace resolved from the session (`requireApiContext`), never from client input. Roles: `viewer < editor < admin < owner`. Mutations default to `editor`; connections and settings require `admin`.
