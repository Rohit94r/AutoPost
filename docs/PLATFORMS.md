# Platform setup (15 platforms)

Replace `https://app.example.com` with your `APP_BASE_URL`. Register **exact** redirect URLs; platforms reject mismatches.

## URLs every app review asks for

| What | URL |
|---|---|
| Privacy Policy | `https://app.example.com/privacy` |
| Terms of Service | `https://app.example.com/terms` |
| Data deletion instructions | `https://app.example.com/data-deletion` |
| Meta deauthorize callback | `https://app.example.com/api/webhooks/meta/deauthorize` |
| Meta data deletion callback | `https://app.example.com/api/webhooks/meta/data-deletion` |
| OAuth redirect (any platform) | `https://app.example.com/api/v1/social-accounts/<platform>/callback` |

Set `LEGAL_ENTITY_NAME`, `SUPPORT_EMAIL` and `LEGAL_JURISDICTION` so the legal pages name you correctly. Have your own lawyer review them before launch.

## What each platform allows (official APIs only)

| Platform | Connect | Publish | Comments & replies | Mentions | Analytics | Key restriction |
|---|---|---|---|---|---|---|
| LinkedIn | OAuth | Text, image, video | Org pages only | No | Org/approved | Comments and analytics need Community Management API approval |
| Instagram | OAuth (Instagram Login) | Image, Reel | Yes | No (webhook only) | Yes | Business/Creator accounts; public media URL; app review |
| X | OAuth 2.0 PKCE | Text, 4 images, video | Yes* | Yes | Yes | Pay-per-use; *API replies only to posts that mention/quote you (since Feb 2026) |
| Facebook Pages | OAuth (Facebook Login) | Text/link, photo, video | Yes | No | Yes | Pages only (no personal timelines); app review + business verification |
| Threads | OAuth | Text, image, video | Yes | Yes | Yes | 500 chars; 250 posts / 1000 replies per day |
| YouTube | Google OAuth | Video | Yes | No | Yes | Upload quota 100/day by default |
| TikTok | OAuth (Login Kit) | Video | No API | No | Yes | Unaudited apps post privately until TikTok audits the app |
| Pinterest | OAuth | Image Pins | No API | No | Yes | Trial-access Pins are sandboxed; needs a board |
| Reddit | OAuth | Text/link posts | Yes | Yes | Basic | New apps need Reddit approval; commercial use needs an agreement |
| Bluesky | App password | Text, up to 4 images | Yes | Yes | Yes | 300 graphemes |
| Mastodon | Access token | Text, images, video | Yes | Yes | Yes | Instance character limit (read automatically) |
| Telegram | Bot token + channel | Text, photo, video | No | No | No | Bot must be a channel admin |
| Discord | Channel webhook | Text, files | No | No | No | Webhooks can't read messages |
| WordPress | Application password | Blog post + featured image | Yes | No | No | HTTPS site with REST API enabled |
| Custom website | Signed webhook | JSON payload | No | No | No | Verify `X-Verdant-Signature` on your server |

The app shows these same capabilities on the Accounts page, so users always know what will and won't work.

---

## LinkedIn
1. Create an app at https://www.linkedin.com/developers/apps (it must be linked to a LinkedIn Page).
2. Under **Products**, add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. **Auth**: redirect `…/social-accounts/linkedin/callback`. Put the keys in `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
4. Optional: the **Community Management API** (separate vetted app) adds organization pages, comments and replies, and analytics. Set `LINKEDIN_ENABLE_ORGANIZATIONS=true`.

## Instagram (Instagram Login)
1. At https://developers.facebook.com/apps, create a **Business** app, add the **Instagram** product, and choose **API setup with Instagram login**.
2. Set the redirect `…/social-accounts/instagram/callback`. Use the **Instagram** app ID and secret (`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`).
3. Permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`. If one isn't enabled on your app, set `INSTAGRAM_REQUEST_COMMENTS=false` or `INSTAGRAM_REQUEST_INSIGHTS=false`.
4. Add the **Deauthorize** and **Data deletion** callback URLs from the table above.
5. Add testers while in development. Submit for **App Review** before public launch.
6. Media must be publicly downloadable. Use `STORAGE_DRIVER=s3`, or a public HTTPS `APP_BASE_URL`.

## Facebook Pages
1. In the same or a separate Meta app, add **Facebook Login for Business**. Set the redirect `…/social-accounts/facebook/callback`.
2. Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `publish_video`.
3. Put the keys in `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`. During sign-in, users pick the Pages to share; each Page becomes its own account.
4. Advanced Access needs App Review and Business Verification.

## Threads
1. Add the **Threads API** use case to a Meta app. Set the redirect `…/social-accounts/threads/callback`.
2. Permissions: `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`, `threads_manage_mentions`.
3. Put the keys in `THREADS_APP_ID` and `THREADS_APP_SECRET`. Add testers until App Review is approved.

## YouTube
1. In Google Cloud Console, enable **YouTube Data API v3** and create an OAuth client (Web). Set the redirect `…/social-accounts/youtube/callback`.
2. Scopes: `youtube.upload`, `youtube.force-ssl`, `youtube.readonly`. Configure the OAuth consent screen. In "Testing" mode, refresh tokens expire after 7 days, so publish the app for production.
3. Put the keys in `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`, or reuse `GOOGLE_*`. Uploads use their own quota bucket (100 per day by default); request more in Cloud Console.

## TikTok
1. At https://developers.tiktok.com, create an app and add **Login Kit** and the **Content Posting API** (Direct Post).
2. Set the redirect `…/social-accounts/tiktok/callback`. Scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish`, `video.list`.
3. Put the keys in `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`. Until TikTok audits the app, posts are visible only to the creator. Apply for the Direct Post audit.

## Pinterest
1. At https://developers.pinterest.com, create an app. Set the redirect `…/social-accounts/pinterest/callback`.
2. Scopes: `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`. Put the keys in `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`.
3. Trial access creates sandboxed Pins. Apply for **Standard** access (demo video of the OAuth flow). Users pick a board under Accounts → Settings.

## Reddit
1. Request API access under Reddit's Responsible Builder Policy. Approval is required for new apps, and commercial use needs an agreement with Reddit.
2. Create a **web app** at https://www.reddit.com/prefs/apps. Set the redirect `…/social-accounts/reddit/callback`.
3. Set `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` and `REDDIT_USERNAME` (used in the required User-Agent). Posts go to the user's profile unless a subreddit is set in Accounts → Settings.

## X
1. In the X Developer Console (https://console.x.com), create an app and set up **User authentication**: Read and write, Web App (confidential client), callback `…/social-accounts/x/callback`.
2. Put the keys in `X_CLIENT_ID` and `X_CLIENT_SECRET`. Fund pay-per-use credits.
3. Inbox replies and mentions cost reads, so they're off until you set `ENGAGEMENT_X_ENABLED=true`. API replies only work on posts that mention or quote the account.

## Bluesky, Mastodon, Telegram, Discord, WordPress, custom website
No server setup. Users connect from **Accounts** with:
- **Bluesky**: handle + **App Password** (Settings → Privacy and security → App passwords).
- **Mastodon**: instance URL + access token (Preferences → Development → New application, scopes `read write`).
- **Telegram**: bot token from @BotFather + channel (`@name` or `-100…`). The bot must be a channel admin.
- **Discord**: channel webhook URL (Channel settings → Integrations → Webhooks).
- **WordPress**: site URL + username + **Application Password** (Users → Profile).
- **Custom website**: an HTTPS endpoint. Verdant sends `POST` JSON with headers `X-Verdant-Timestamp` and `X-Verdant-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`.

User-supplied hosts (Mastodon instances, WordPress sites, webhooks, self-hosted Bluesky) must be public HTTPS. Private and loopback addresses are blocked (SSRF protection).

## Approval tracker

| Platform | App created | Redirect registered | Permissions approved | Review/audit | Real-account test |
|---|---|---|---|---|---|
| LinkedIn | ☐ | ☐ | ☐ | CMA (optional) ☐ | ☐ |
| Instagram | ☐ | ☐ | ☐ | App Review ☐ | ☐ |
| Facebook Pages | ☐ | ☐ | ☐ | App Review + Business Verification ☐ | ☐ |
| Threads | ☐ | ☐ | ☐ | App Review ☐ | ☐ |
| YouTube | ☐ | ☐ | ☐ | OAuth verification ☐ | ☐ |
| TikTok | ☐ | ☐ | ☐ | Direct Post audit ☐ | ☐ |
| Pinterest | ☐ | ☐ | ☐ | Standard access ☐ | ☐ |
| Reddit | ☐ | ☐ | ☐ | API approval ☐ | ☐ |
| X | ☐ | ☐ | ☐ | Credits funded ☐ | ☐ |

Don't call a platform production-ready until its real-account test passes with production credentials.
