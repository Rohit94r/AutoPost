# REST API (v1)

Base path: `/api/v1`. All endpoints require a session cookie (from `/api/auth/*`) and act on the caller's **active workspace**. Request and response bodies are JSON unless noted.

## Conventions

| Topic | Rule |
|---|---|
| Auth | 401 `unauthorized` without a session; 403 `forbidden` for missing membership or role |
| Roles | GET → viewer; mutations → editor; connections/settings → admin |
| CSRF | Mutations must send `Origin: <APP_BASE_URL>` (browsers do automatically) |
| Errors | `{ "error": { "code", "message", "details", "correlationId" } }` |
| Validation | 400 `validation_error` with zod `details` |
| Rate limits | 429 `rate_limited` + `Retry-After`. Buckets: api 120/min, ai 20/min, upload 20/min, publish 30/min, oauth 10/min (per user) |
| Quotas | 402 `quota_exceeded` with `{ kind, used, limit, plan }` |
| Idempotency | `Idempotency-Key` header on `POST /publishing-jobs`. Replays return the stored response with `Idempotent-Replay: true`. |
| Tracing | `x-request-id` response header (send your own to propagate it) |
| Pagination | `page` (1-based) and `pageSize`. Responses include `total`. |

## Endpoints

### Account & workspace
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | user, workspace, memberships, integration + AI status |
| PATCH | `/me` | `{ name?, timezone?, completeOnboarding? }` |
| GET / PATCH | `/workspace` | PATCH (admin): `{ name?, timezone?, documentRetentionDays?, aiProcessingConsent? }` |
| POST | `/workspace/switch` | `{ workspaceId }` → sets active workspace cookie after a membership check |
| GET | `/workspace/export` | JSON download (admin) |
| DELETE | `/account` | `{ confirmEmail }` |
| GET | `/usage` | plan, monthly usage vs limits |
| GET / POST | `/notifications` | POST marks all read |
| GET | `/dashboard` | widget data |
| GET | `/admin/overview` | `ADMIN_EMAILS` only |

### Content
| Method | Path | Notes |
|---|---|---|
| GET | `/content` | `q, view(all\|drafts\|published\|templates\|ai\|archived), status, tag, campaign, page, pageSize` |
| POST | `/content` | `{ title, body, linkUrl?, hashtags[], callToAction?, campaign?, tags[], brandProfileId?, mediaIds[], variants: [{ platform, body, hashtags[], includeMedia }] }` |
| GET / PATCH / DELETE | `/content/:id` | DELETE removes drafts; posts with history are archived |
| POST | `/content/:id/duplicate` · `/unarchive` · `/retry-failed` | |

### AI
| Method | Path | Body |
|---|---|---|
| POST | `/ai/generate` | `{ idea, platforms[], link?, brandProfileId?, controls? }` → `{ variants[{platform,text,hashtags,issues}], notes, provider, model }` |
| POST | `/ai/rewrite` | `{ text, operation(improve\|rewrite\|shorten\|expand\|tone\|simplify\|fix_grammar), platform?, controls? }` → `{ before, after, changes, issues }` |
| POST | `/ai/adapt` | `{ text, platforms[] }` |
| POST | `/ai/hashtags` | `{ text, platform, count }` |
| POST | `/ai/critique` | `{ text, platform, source? }` → `{ score, issues[] }` |

`controls` = `{ tone, length, audience, perspective, formality, emoji, hashtags, callToAction, language, avoid[], vocabulary[] }`, all optional (brand defaults fill gaps).

### Documents
| Method | Path | Notes |
|---|---|---|
| GET | `/documents` | list |
| POST | `/documents` | multipart: `file`, `consent=true`. Validates, stores privately, queues extraction. |
| GET / DELETE | `/documents/:id` | includes latest extraction |
| GET | `/documents/:id/file` | private preview |
| POST | `/documents/:id/extract` | re-run extraction |
| PUT | `/documents/:id/review` | `{ fields[{key,label,value,confidence,source}], userClaims? }` |
| POST | `/documents/:id/directions` | content directions from reviewed facts |
| POST | `/documents/:id/generate` | `{ direction, platforms[] }` → creates a draft, returns `contentId` |

### Media
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/media` | POST multipart `file`, `altText?` |
| PATCH / DELETE | `/media/:id` | `{ altText }` |
| GET | `/media/:id/file[?variant=thumb]` | |

### Social accounts
| Method | Path | Notes |
|---|---|---|
| GET | `/social-accounts` | accounts (no tokens) + platform configuration |
| POST | `/social-accounts/:platform/connect` | → `{ url }` official consent screen (admin) |
| GET | `/social-accounts/:platform/callback` | OAuth redirect target |
| POST | `/social-accounts/:id/refresh` | where supported |
| DELETE | `/social-accounts/:id` | disconnect + revoke where supported |

### Engagement
| Method | Path | Notes |
|---|---|---|
| GET | `/engagement` | inbox: `status(open|new|needs_review|replied|ignored|all), platform, accountId, postId, kind, q, page` + counts |
| PATCH | `/engagement/:id` | `{ status: new|needs_review|ignored }` |
| POST | `/engagement/:id/suggest` | AI draft + sentiment (nothing posted) |
| POST | `/engagement/:id/reply` | `{ text }` → posted on the platform now |
| POST | `/engagement/sync` | sync posts/comments/mentions for every connected account |
| GET / POST | `/autopilot/rules` | list / create (admin) |
| PATCH / DELETE | `/autopilot/rules/:id` | update / delete (admin) |

### More AI
| Method | Path | Body |
|---|---|---|
| POST | `/ai/brand-autofill` | `{ description }` → brand voice fields (not saved) |
| POST | `/ai/image` | `{ text?, prompt?, style?, platform?, aspectRatio?, generate? }` → prompt + alt text; with `generate` saves an image to the media library |

### Social accounts (credential platforms)
| Method | Path | Notes |
|---|---|---|
| POST | `/social-accounts/:platform/credentials` | `{ values }` for bluesky, mastodon, telegram, discord, wordpress, webhook |
| PATCH | `/social-accounts/:id/settings` | `{ subreddit?, boardId?, privacy?, tiktokPrivacy? }` |

### Webhooks (called by platforms)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/webhooks/meta/deauthorize` | Meta `signed_request` (HMAC-verified) |
| POST | `/api/webhooks/meta/data-deletion` | returns `{ url, confirmation_code }` |

### Publishing
| Method | Path | Notes |
|---|---|---|
| GET | `/publishing-jobs` | `status` (comma list), `platform, from, to, page, pageSize, order` |
| POST | `/publishing-jobs` | `{ contentId, targets[{socialAccountId}], mode(now\|schedule), scheduledAtLocal?, timezone }`. 422 `preflight_failed` lists per-destination problems. Duplicates are returned in `skipped`. |
| POST | `/publishing-jobs/:id/cancel` | only before processing starts |
| POST | `/publishing-jobs/:id/reschedule` | `{ scheduledAtLocal, timezone }` (scheduled only) |
| POST | `/publishing-jobs/:id/retry` | `{ confirmNotPublished? }`. 409 `confirm_required` for ambiguous failures. |
| GET | `/publishing-jobs/:id/attempts` | per-attempt outcomes |

### Analytics
| Method | Path | Notes |
|---|---|---|
| GET | `/analytics?days=30` | `{ publishing: { totals, byPlatform, series }, platforms: [{ metrics[{metric,total,postsWithData,postsWithout,reasons}], engagement, lastCollectedAt }] }` |

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ status, checks: { database, redis } }` |
| GET | `/api/public-media?key&exp&sig` | HMAC-signed, expiring media URL for platforms (local storage driver) |
