# Engagement: inbox, autopilot and app pages

## How data flows

```
worker (every 5 min)
  └─ syncDueAccounts: each connected account whose last sync is older than ENGAGEMENT_SYNC_MINUTES
       ├─ fetchRecentPosts   → published_posts (source=imported)    [platforms with importPosts]
       ├─ fetchComments      → engagement_items (per post, last 14 days)
       └─ fetchMentions      → engagement_items (kind=mention)
  └─ runAutopilot: enabled rules × new items (last 3 days)
       └─ draftReply (AI) → classify → reply via adapter, or save a draft for review
```

Items are unique per `(social_account_id, external_id)`, so repeated syncs never duplicate them. Comments written by the account itself are stored with `status=own` and hidden.

## Inbox → Comments (`/inbox`)

- Filters: To do (new + needs review), Replied, Ignored, All; by platform; comment/reply/mention.
- **Suggest reply** drafts a reply with AI. Nothing is posted until you press **Send reply**.
- **Send reply** posts on the platform immediately, as the connected account, and records `replied_by=user`.
- **Check for new** runs a sync for every account in the workspace right away.

## Inbox → Autopilot (`/inbox?tab=autopilot`)

| Setting | Meaning |
|---|---|
| Trigger | every comment · questions · keywords · mentions |
| Mode | **Draft**: prepare a reply for approval in the inbox. **Auto**: post it. |
| Daily limit | Max auto-replies per rule per UTC day |
| Negative → review | Negative comments are never auto-answered |
| Instructions | What to say, what not to promise, sign-off style |
| Accounts | Limit the rule to some accounts (default: all that support replies) |

Safety rules applied to every rule:
- spam and abusive comments are never answered (spam is marked ignored);
- no replies to the account's own comments;
- at most one auto-reply per author per post per 24 hours;
- previous replies are passed to the AI so wording doesn't repeat;
- replies are trimmed to each platform's limit;
- if the platform rejects a reply (for example X's mention-only rule), the item goes to review with the reason.

## App pages (sidebar → Apps ▾ → `/channels/<platform>`)

Account stats (followers etc., refreshed every 6 h), totals (posts, comments, likes, views, shares), a 30-day posting chart, delivery success through Verdant, autopilot status, and every known post with its latest metrics. Below that is the app's own comment inbox: reply there and it posts on the platform. Each post's comment count filters the comments to that post (`?post=<id>`); **Check for new** syncs only that app.

## Costs to keep in mind

- **X**: every post read is billed, so inbox sync for X is opt-in (`ENGAGEMENT_X_ENABLED=true`). Replies also cost credits.
- **YouTube**: `comments.insert` costs 50 units out of the 10,000-unit daily quota.
- **Threads**: 1,000 replies per 24 h.
