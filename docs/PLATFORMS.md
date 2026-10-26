# Platform developer-console setup

The callback URLs below assume `APP_BASE_URL=https://app.example.com`. Register **exact** URLs; platforms reject mismatches.

## LinkedIn

1. Go to https://www.linkedin.com/developers/apps and create an app. It must be linked to a LinkedIn Page you administer.
2. **Products** tab: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. **Auth** tab:
   - Authorized redirect URL: `https://app.example.com/api/v1/social-accounts/linkedin/callback`
   - Copy the Client ID and Client Secret into `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
4. Scopes requested: `openid profile email w_member_social`.
5. Optional, organization pages: request the **Community Management API**. It's a vetted product; it must be requested on an app with no other products, and the Standard tier requires a screencast review. Once approved, set `LINKEDIN_ENABLE_ORGANIZATIONS=true` (adds `w_organization_social r_organization_social`).
6. Optional, post analytics: `r_member_postAnalytics` is part of the Community Management API. Without it, LinkedIn engagement shows as *permission missing*.

| Item | Status |
|---|---|
| Member text/image/video posts | Implemented (Posts, Images, Videos APIs, version `LINKEDIN_API_VERSION`) |
| Token refresh | Partners only. Users reconnect every ~60 days (reminders sent). |
| Revocation | No API. Tokens are deleted locally; users can remove access at linkedin.com/psettings/permitted-services. |
| Rate limit | 150 requests / member / day (Share on LinkedIn) |

## Instagram (Instagram API with Instagram Login)

1. Go to https://developers.facebook.com/apps and create an app (type **Business**), then add the **Instagram** product, choosing **API setup with Instagram login**.
2. Under **Business login settings**:
   - OAuth redirect URI: `https://app.example.com/api/v1/social-accounts/instagram/callback`
   - Copy the **Instagram app ID** and **Instagram app secret** (not the Facebook app ones) into `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.
3. Permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`.
4. In development mode, add the Instagram accounts as **testers** (App roles). For public use, submit **App Review** for these permissions.
5. Accounts must be **Business or Creator**. Personal accounts connect but are marked ineligible.
6. Instagram downloads media from a URL. Use `STORAGE_DRIVER=s3` (presigned GET URLs) or make sure `APP_BASE_URL` is publicly reachable over HTTPS (signed `/api/public-media` URLs).

| Item | Status |
|---|---|
| Single image (JPEG; PNG/WebP auto-converted) | Implemented |
| Reels (MP4/MOV) | Implemented (container polling) |
| Carousels / Stories | Not implemented (documented future work) |
| Daily limit | Read at runtime from `content_publishing_limit` |
| Token refresh | Implemented (60-day long-lived tokens, refreshed when < 7 days remain) |

## X

1. Go to https://developer.x.com/en/portal/dashboard, create a Project and an App.
2. **User authentication settings**:
   - App permissions: **Read and write**
   - Type of App: **Web App (confidential client)**
   - Callback URI: `https://app.example.com/api/v1/social-accounts/x/callback`
   - Website URL: your site
3. Copy the **OAuth 2.0 Client ID and Client Secret** into `X_CLIENT_ID` and `X_CLIENT_SECRET`.
4. Scopes requested: `tweet.read tweet.write users.read media.write offline.access`.
5. Billing: X uses **pay-per-use credits**. Posts containing a URL cost more than plain posts. Add credits in the developer portal. When credits run out, publishing fails with a clear "insufficient credits or access" message (not retried).
6. Metrics collection reads are billed too, so it's off by default (`ANALYTICS_X_ENABLED=false`).

| Item | Status |
|---|---|
| Text posts, up to 4 images or 1 video | Implemented (v2 media upload: one-shot images, chunked video) |
| Weighted 280-char validation | Implemented (URLs = 23, CJK/emoji = 2) |
| Refresh token rotation | Implemented (new refresh token stored on every refresh) |
| Revocation | Implemented (`/2/oauth2/revoke`) |

## Approval status

Fill this in for your deployment.

| Platform | Dev app created | Redirect registered | Products/scopes approved | App review | Production-ready |
|---|---|---|---|---|---|
| LinkedIn | ☐ | ☐ | ☐ | n/a | ☐ |
| Instagram | ☐ | ☐ | ☐ | ☐ | ☐ |
| X | ☐ | ☐ | ☐ | n/a (credits) | ☐ |

Don't mark a platform production-ready until real-account tests pass with the production credentials.
