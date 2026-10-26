# Platform & AI API notes (verified 2026-10-26)

These facts were checked against official documentation on **2026-10-26** and drive the adapter
implementations. Platform APIs change often — re-verify before each release and update
`LINKEDIN_API_VERSION`, `INSTAGRAM_GRAPH_VERSION` and `AI_MODEL_*` env vars rather than code.
Items marked *unverified* were not confirmed in official docs; the code treats them defensively.

## LinkedIn (learn.microsoft.com/linkedin)

- Authorize `https://www.linkedin.com/oauth/v2/authorization`; token `POST https://www.linkedin.com/oauth/v2/accessToken` (form). Code valid 30 min. Access token 60 days.
- **Refresh tokens only for a limited set of partners.** Others must re-authorize (consent screen is skipped while the member is logged in). Verdant shows "Expires in N days → Reconnect".
- Scopes: `openid profile email` (Sign In with LinkedIn using OpenID Connect) + `w_member_social` (Share on LinkedIn). Organization posting: `w_organization_social` from the **Community Management API** (vetted; Standard tier requires screencast review; must be requested on an app with no other products).
- No documented revoke endpoint. Token introspection: `POST https://www.linkedin.com/oauth/v2/introspectToken`.
- `GET https://api.linkedin.com/v2/userinfo` → `sub` → author `urn:li:person:{sub}`.
- Every `/rest/` call: `LinkedIn-Version: YYYYMM` (latest **202610**, monthly, each supported ≥ 1 year) and `X-Restli-Protocol-Version: 2.0.0`.
- `POST /rest/posts` → **201**, post URN in the `x-restli-id` header. URL: `https://www.linkedin.com/feed/update/{urn}/`.
- `commentary` uses "little" text format: reserved characters `| { } @ [ ] ( ) < > # \ * _ ~` must be backslash-escaped.
- Images: `POST /rest/images?action=initializeUpload` → `{value:{uploadUrl,image}}` → PUT bytes. JPG/GIF/PNG.
- Videos: `POST /rest/videos?action=initializeUpload` (fileSizeBytes) → PUT byte ranges, collect `etag` headers → `POST /rest/videos?action=finalizeUpload` → poll `GET /rest/videos/{urn}` until `AVAILABLE`. MP4, 3 s–30 min, 75 KB–500 MB.
- Member post analytics: `GET /rest/memberCreatorPostAnalytics` needs `r_member_postAnalytics` (Community Management API). Without it, Verdant shows LinkedIn engagement as *permission missing*.
- Rate limit (Share): 150 requests / member / day.

## Instagram API with Instagram Login (developers.facebook.com/docs/instagram-platform)

- Authorize `https://www.instagram.com/oauth/authorize`; scopes `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`.
- Short-lived token `POST https://api.instagram.com/oauth/access_token` (form) → `{access_token,user_id,permissions}` (some responses wrap in `data[]`).
- Long-lived: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token` (60 days). Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` (token ≥ 24 h old, not expired).
- Graph API version: **v26.0**.
- Profile `GET /me?fields=user_id,username,name,account_type,profile_picture_url`.
- Publish: `POST /{ig_id}/media` (image_url+caption+alt_text, or media_type=REELS+video_url) → poll `GET /{container}?fields=status_code` (`IN_PROGRESS|FINISHED|ERROR|EXPIRED|PUBLISHED`) → `POST /{ig_id}/media_publish?creation_id=` → `GET /{media}?fields=permalink`.
- Daily limit: docs disagree (50 vs 100). **Read `GET /{ig_id}/content_publishing_limit?fields=quota_usage,config` at runtime.**
- Images: JPEG only, ≤ 8 MB, aspect 4:5 – 1.91:1. Reels: MP4/MOV, H.264/HEVC, 3 s – 15 min, ≤ 300 MB.
- Insights `GET /{media}/insights?metric=views,reach,likes,comments,shares,saved,total_interactions`. `impressions` is deprecated.

## X API v2 (docs.x.com)

- Authorize `https://x.com/i/oauth2/authorize` (PKCE S256); token `POST https://api.x.com/2/oauth2/token` with Basic auth for confidential clients. Code valid 30 s; access token 2 h; refresh token only with `offline.access` (store any rotated refresh token).
- Revoke `POST https://api.x.com/2/oauth2/revoke`.
- Scopes: `tweet.read tweet.write users.read media.write offline.access`.
- `POST /2/tweets` `{text, media:{media_ids}}` → 201 `{data:{id,text}}`.
- Media v2: one-shot `POST /2/media/upload` (multipart `media`, `media_category`) for images; chunked `POST /2/media/upload/initialize` → `/{id}/append` (segments ≤ 5 MB) → `/{id}/finalize` → `GET /2/media/upload?command=STATUS&media_id=`.
- Metrics: `tweet.fields=public_metrics` (incl. `impression_count`); `non_public_metrics` only own posts ≤ 30 days.
- **Pricing: pay-per-use credits.** Post create $0.015, **post create containing a URL $0.20**. No confirmed free tier.
- 280 weighted chars: URL = 23, Latin = 1, CJK/emoji = 2, NFC-normalized.

## Groq (console.groq.com)

- Production chat models: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
- **Both Llama models shut down for free/developer tiers on 2026-08-16** → defaults use gpt-oss.
- Structured outputs: `response_format: {type:"json_schema", json_schema:{name, strict, schema}}` (strict on gpt-oss); `json_object` works on all.

## Gemini (ai.google.dev)

- Stable: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; `gemini-4-argon` (paid). Preview: `gemini-3.1-pro-preview`.
- `gemini-2.5-*` restricted to past users — not used as defaults.
- `generateContent` is labelled legacy but fully supported; structured output via `responseMimeType: "application/json"` + `responseJsonSchema`.
- Inline data ≤ 100 MB per request (PDF ≤ 50 MB, ≤ 1000 pages).
- Usage: `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` (billed), `totalTokenCount`.

## Second verification round (2026-10-26): new platforms

- **Facebook Pages**: Graph `v26.0`; `/me/accounts` page tokens (non-expiring from long-lived user tokens). `/feed`, `/photos` (url), `graph-video…/videos` (file_url). Comments `GET /{post}/comments`, reply `POST /{comment}/comments`. **`post_impressions` removed 2025-11-15**, so use `post_media_view`.
- **Threads**: base `graph.threads.com/v1.0`; authorize `threads.com/oauth/authorize`; long-lived `th_exchange_token`, refresh `th_refresh_token`. Containers → `threads_publish`; replies via `reply_to_id`; `/conversation` for all replies; `/mentions` needs `threads_manage_mentions`. 500 chars; 250 posts / 1000 replies per day.
- **Instagram comments**: `instagram_business_manage_comments`; `GET /{media}/comments`, reply `POST /{comment}/replies`. Mentions only via webhooks under Instagram Login.
- **YouTube**: resumable `videos.insert` now uses its own "Video Uploads" quota bucket (default 100/day); unverified projects are **no longer** forced to private (per current docs; test it). `comments.insert` = 50 units.
- **TikTok** (docs geoblocked; from official snippets): Direct Post `/v2/post/publish/video/init/` (FILE_UPLOAD or verified PULL_FROM_URL), `creator_info` privacy options, status fetch. Unaudited apps: SELF_ONLY. No comments API for Login Kit apps.
- **Pinterest v5**: continuous refresh tokens (60 days each, rotate). `POST /v5/pins` with `media_source.image_url`. Trial Pins are sandboxed.
- **Reddit**: approval required for new apps (Responsible Builder Policy); descriptive User-Agent mandatory; `/api/submit`, `/api/comment`, `/message/mentions`.
- **Bluesky**: `createSession` (app password), `createRecord`, facets with UTF-8 byte offsets, images ≤ 2,000,000 bytes (we keep < 950 KB), 300 graphemes.
- **X engagement**: since **2026-02-23** self-serve API replies only work when the original author mentioned or quoted you. Mentions `GET /2/users/:id/mentions`; conversation search covers 7 days. Reads are billed.
- **LinkedIn comments**: `/rest/socialActions/{urn}/comments` (Community Management API); member post reading is restricted.
- **Gemini images**: Imagen is shut down. Use `gemini-3.1-flash-image` (or `gemini-3-pro-image`) with `generateContent` + `responseModalities: ["IMAGE"]`.
