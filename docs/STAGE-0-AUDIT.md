# Stage 0: Repository audit & implementation plan

**Date:** 2026-10-26

## 1. Audit findings

| Area | Finding |
|---|---|
| Repository | Empty directory, no git history. Greenfield build, so nothing existing could break. |
| Tooling available | Node 24, pnpm 10, git 2.51. Docker installed but not to be used on the development laptop. |
| Existing auth / DB / UI | None |
| Deployment config | None |

**Conclusion:** no existing conventions to preserve. The stack follows the brief's preferred architecture exactly.

## 2. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| App framework | Next.js 16 App Router + React 19 + TS strict | Brief's preference; route handlers for the REST API |
| Worker | Separate persistent Node process (`worker/index.ts`) in the same repo | Shares services with the web app; never relies on serverless timing |
| DB | PostgreSQL + Drizzle ORM + SQL migrations | Typed schema, partial unique indexes, transactions |
| Queue | Redis + BullMQ 5 | Delayed jobs and concurrency. **Postgres stays the source of truth** (sweeper recovers due jobs). |
| Auth | better-auth (email/password, Google, DB sessions) | Mature, server-side sessions in Postgres, no auth crypto written by hand |
| Token security | AES-256-GCM envelope with key IDs (rotation) | Tokens never leave the server |
| AI | `groq-sdk` + `@google/genai` behind `AIProvider` | Provider-independent business logic |
| Storage | Local disk (dev) / any S3-compatible bucket (prod) | Private by default; signed URLs for platforms |
| Tests | Vitest + PGlite (in-process Postgres) + Playwright | Real SQL semantics in tests without Docker |

## 3. Data model (summary)

`users, sessions, auth_accounts, verifications` (auth) ·
`workspaces, workspace_members, brand_profiles` ·
`social_accounts, encrypted_oauth_credentials, oauth_states` ·
`content_items, content_variants, content_media, media_assets` ·
`uploaded_documents, document_extractions, ai_generation_jobs` ·
`publishing_jobs, publishing_attempts, published_posts, post_analytics` ·
`notification_events, audit_logs, usage_records, subscription_records, idempotency_keys`

Full definitions: `src/server/db/schema/index.ts`. Migration: `drizzle/0000_init.sql`.

## 4. External integrations

Platform and AI facts were verified against the official docs on 2026-10-26. See [PLATFORM-API-NOTES.md](PLATFORM-API-NOTES.md).

## 5. Risks & external dependencies

| Risk | Impact | Mitigation |
|---|---|---|
| LinkedIn refresh tokens only for partners | Reconnect every ~60 days | Expiry reminders 7 days ahead; status surfaced in UI |
| Organization posting needs Community Management API approval | Member posting only by default | `LINKEDIN_ENABLE_ORGANIZATIONS` flag, documented |
| Instagram: professional accounts only, public media URLs, app review | Personal accounts can't publish; localhost can't publish media | Eligibility shown at connect; signed public URLs; docs |
| Instagram daily limit (docs say 50 or 100) | Over-limit failures | Quota read at runtime before publishing |
| X pay-per-use pricing; URL posts cost more | Unexpected cost | Composer warning; X metrics collection off by default |
| Groq Llama models retired for free/dev tiers (2026-08-16) | Broken defaults | Defaults use `openai/gpt-oss-*`; models configurable |
| Gemini 2.5 restricted to existing users | Broken defaults | Defaults use `gemini-3.8-flash`; configurable |
| Ambiguous publish outcomes (timeouts) | Duplicate posts | Never auto-retried; user confirms before retry |

## 6. Stage plan

Stages 1–10 as defined in the brief. Completion status is tracked in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
