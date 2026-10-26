# Security & privacy

## Controls

| Threat | Control | Where |
|---|---|---|
| Token leakage | AES-256-GCM encrypted tokens in a separate table; never selected into API responses; logger redaction | `crypto/`, `oauth/service.ts`, `logger.ts` |
| Secret exposure | Server-only env (`server-only` import guard); no `NEXT_PUBLIC_` secrets; `.env*` git-ignored; CI check | `env.ts`, `.gitignore`, CI |
| CSRF (API) | Mutations require `Origin` equal to `APP_BASE_URL`; cookies are SameSite=Lax and httpOnly | `http/handler.ts` |
| CSRF (OAuth) | Random single-use `state` stored hashed and bound to user + platform + 10-min expiry; PKCE for X | `oauth/service.ts` |
| Cross-workspace access | Workspace resolved from the session; every query filtered by `workspace_id`; role checks | `auth/session.ts`, services |
| SQL injection | Drizzle parameterised queries only; LIKE input escaped | services |
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP; uploads served with `nosniff` and their own CSP | `next.config.ts`, routes |
| SSRF | Outbound platform calls limited to HTTPS allow-listed hosts; `redirect: "error"` | `platforms/http.ts` |
| Malicious uploads | Magic-byte detection; extension and declared MIME must match; size limits; images re-encoded for thumbnails; private storage | `media/validate.ts` |
| Prompt injection | Untrusted text fenced; system prompt forbids following it; extractor flags embedded instructions; documents never re-routed to another provider | `ai/prompt-builder.ts`, `documents/service.ts` |
| Duplicate / replayed publishing | Idempotency keys; partial unique index; atomic claim; ambiguous outcomes need confirmation | `publishing/*` |
| AI abuse | Per-user AI rate limit + monthly quota | `rate-limit.ts`, `usage/service.ts` |
| Brute force | better-auth rate limiting; 10+ character passwords; session revocation on password reset | `auth/auth.ts` |
| Headers | CSP, HSTS (prod), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | `next.config.ts` |

## Audit log

Recorded actions: content created/deleted/archived, publish requested/scheduled/cancelled/rescheduled/retried, social account connected/disconnected, media uploaded/deleted, document uploaded/deleted/file purged, workspace updated/exported, user deleted. Metadata never includes tokens or document text.

## Data retention & deletion

- Original documents: deleted after `documentRetentionDays` (workspace setting, default 30). Reviewed facts stay until the document is deleted.
- Disconnecting an account deletes its tokens immediately (and revokes them on X).
- Account deletion removes workspaces the user solely owns, with their stored files and tokens, then the user and sessions.
- Workspace export: `GET /api/v1/workspace/export` (admin).

## Dependency hygiene

- `pnpm audit` in CI or before releases; Dependabot or Renovate recommended.
- Pinned majors for BullMQ 5 and ioredis 5 (deliberately not the newest majors).

## Reporting

Report suspected vulnerabilities privately to the maintainers. Don't open public issues for security problems.
