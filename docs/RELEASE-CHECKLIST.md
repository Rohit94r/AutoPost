# Release readiness

**Legend:** ✅ implemented and covered by automated tests · 🟡 implemented, needs verification in your environment (real DB, Redis, credentials, accounts) · ⏳ requires external action

## Verification performed (2026-10-26, development laptop)

| Check | Result |
|---|---|
| `pnpm typecheck` (TS strict) | ✅ pass |
| `pnpm lint` (eslint-config-next 16) | ✅ pass, 0 problems |
| `pnpm test`: unit + integration (PGlite Postgres, mocked HTTP) | ✅ 92 tests, 10 files, all pass |
| `pnpm build` (Next.js production build) | ✅ pass |
| Migrations on a clean database | ✅ applied on PGlite in every integration run; 🟡 run `pnpm db:migrate` on your Postgres |
| E2E (`pnpm test:e2e`) | 🟡 written; needs a running app + Postgres (not run on the dev laptop, by request) |
| Real platform publishing | ⏳ needs your developer apps, credentials and test accounts |

## Stages

| Stage | Status | Evidence |
|---|---|---|
| 0 Audit & plan | ✅ | `docs/STAGE-0-AUDIT.md` |
| 1 Foundation: auth, DB, workspaces, config, logging | ✅ code + isolation tests · 🟡 sign-up flow on real Postgres | `auth/`, `db/`, `isolation-oauth-quota.test.ts` |
| 2 Dashboard, composer, drafts, library, media, brand voice | ✅ | `app/(app)/*`, content service tests |
| 3 AI writing studio (Groq + Gemini) | ✅ mocked-provider tests · 🟡 live keys | `ai/`, `ai.test.ts`, `misc.test.ts` |
| 4 Document intelligence | ✅ validation/retention tests · 🟡 live Gemini extraction with a real certificate | `documents/service.ts` |
| 5 Social OAuth | ✅ state/PKCE/disconnect tests · ⏳ developer-app setup | `oauth/`, `PLATFORMS.md` |
| 6 Publishing engine | ✅ claim, retry, partial success, cancel, recovery, idempotency tests | `publishing.test.ts` |
| 7 Calendar, queue, notifications | ✅ UI + reschedule/cancel tests | `calendar/`, `jobs/` |
| 8 Analytics | ✅ calculation tests · 🟡 live metric collection | `lib/analytics.ts`, `analytics/service.ts` |
| 9 Hardening | ✅ CSP/headers, rate limits, SSRF guard, upload validation, audit log, CI workflow | `SECURITY.md`, `.github/workflows/ci.yml` |
| 10 Release docs | ✅ | `docs/*` |
| + 12 more platforms | ✅ adapters + mocked tests (Bluesky, Mastodon, SSRF) · ⏳ developer apps / approvals | `platforms/*`, `PLATFORMS.md` |
| + Engagement inbox & autopilot | ✅ integration tests (sync, replies, autopilot safety) · 🟡 live accounts | `engagement/*`, `ENGAGEMENT.md` |
| + Legal & Meta callbacks | ✅ signed-request tests · ⏳ lawyer review of Terms/Privacy | `/terms`, `/privacy`, `/data-deletion` |

## Production launch checklist

- [ ] Managed Postgres with PITR; `pnpm db:migrate` run
- [ ] Redis with `noeviction` + AOF
- [ ] Private S3/R2 bucket; `STORAGE_DRIVER=s3`
- [ ] `APP_BASE_URL` on HTTPS; HSTS active
- [ ] `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` generated, stored in a secret manager, offline backup of `ENCRYPTION_KEY`
- [ ] Resend domain verified; `REQUIRE_EMAIL_VERIFICATION=true`
- [ ] Groq and Gemini keys set; model IDs re-verified
- [ ] LinkedIn app: products added, redirect URL registered
- [ ] Instagram app: Instagram Login, testers added / App Review approved
- [ ] X app: OAuth 2.0 confidential client, callback registered, credits funded
- [ ] Web + worker both deployed; `/api/health` = ok; `/admin` queues visible
- [ ] Real-account tests (with explicit permission, on test accounts): connect → publish text → publish image → schedule → cancel → partial failure → retry
- [ ] Backup restore rehearsed in staging
- [ ] `pnpm audit` reviewed

## Known limitations

- Instagram carousels and Stories are not implemented.
- TikTok, Pinterest, Telegram and Discord have no comment API, so they aren't in the inbox.
- LinkedIn comments and replies work only for organization pages with Community Management API access.
- X engagement is opt-in (billed reads), and API replies only work on posts that mention or quote the account.
- Reddit needs Reddit's approval before any API use; commercial use needs an agreement.
- LinkedIn organization posting is behind a flag and needs Community Management API approval.
- Video duration/thumbnail probing (ffprobe) is not implemented; platforms validate video server-side.
- No payment provider. Plans are enforced, upgrades are manual.
- Single-user workspaces in the UI (the schema and roles support members; invitations UI is future work).
- Previews approximate each platform's layout; they aren't pixel-exact.
