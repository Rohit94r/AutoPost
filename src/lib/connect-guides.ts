import type { Platform } from "./platforms";

/**
 * Plain-language lessons for people connecting their own accounts (Get started page): what they
 * can do, what they need, each step with what they'll see, what they're allowing, and fixes for
 * common problems. Nothing here is about server setup; that's in SERVER_GUIDES (admins only).
 */
export interface ConnectGuide {
  /** What connecting lets you do. */
  what: string;
  /** What to have ready before starting. */
  need: string[];
  steps: { title: string; detail: string }[];
  /** What the person approves, in plain words. */
  permissions: string;
  /** What happens once it's connected. */
  after: string;
  trouble: { q: string; a: string }[];
  /** A platform rule worth knowing up front. */
  note?: string;
}

/** The common sign-in steps for platforms that use their own login page. */
const signIn = (site: string, domain: string, extra: { title: string; detail: string }[] = []) => [
  { title: "Click Connect", detail: `You're taken to ${site}'s own sign-in page (${domain}). Check the address bar: you only ever type your password on ${site}, never in Verdant.` },
  { title: "Sign in", detail: `Use your normal ${site} login. If you're already signed in on this browser, ${site} skips this step.` },
  ...extra,
  { title: "Approve the permissions", detail: `${site} lists what Verdant may do. Click Allow (or Authorize) to approve them all; leaving one out can stop features like replies from working.` },
  { title: "You're back in Verdant", detail: "The account now shows as connected here, under Accounts and in the sidebar under Apps." },
];

export const CONNECT_GUIDES: Record<Platform, ConnectGuide> = {
  linkedin: {
    what: "Publish posts with text, photos or a video to your LinkedIn profile, straight from Create post.",
    need: ["A LinkedIn account you can sign in to"],
    steps: signIn("LinkedIn", "linkedin.com"),
    permissions: "Verdant can see your name and photo and publish the posts you create here. It can't read your messages or change your profile.",
    after: "Pick LinkedIn in Create post to post there. LinkedIn sign-ins last about two months; you'll get a reminder to reconnect before that.",
    trouble: [
      { q: "I clicked Cancel by mistake", a: "Nothing was connected. Click Connect again." },
      { q: "It says the connection expired", a: "Open Accounts and click Reconnect on the LinkedIn card. Your posts and history stay." },
    ],
  },
  instagram: {
    what: "Publish photos and Reels to Instagram, see likes and comments, and reply to comments from the Inbox.",
    need: [
      "An Instagram Business or Creator account. Instagram doesn't let apps post to personal accounts.",
      "Switching is free and takes a minute: Instagram app → your profile → ☰ → Settings → Account type and tools → Switch to professional account.",
    ],
    steps: signIn("Instagram", "instagram.com"),
    permissions: "Verdant can publish the posts you create here, read comments on your posts so you can answer them, and read basic insights like likes and reach. It can't read your direct messages.",
    after: "Every Instagram post needs a photo or video: add one in the Media section of Create post. Captions can't have clickable links.",
    trouble: [
      { q: "Instagram says my account isn't eligible", a: "Switch to a Business or Creator account (see above), then click Connect again." },
      { q: "The wrong Instagram account was connected", a: "Log out of Instagram in this browser, then click Connect and sign in to the right account." },
    ],
    note: "Personal Instagram accounts can't be connected by any app; only Business and Creator accounts.",
  },
  facebook: {
    what: "Publish to Facebook Pages you manage and reply to comments on them.",
    need: ["A Facebook Page where you're an admin. Apps can't post to personal profiles."],
    steps: signIn("Facebook", "facebook.com", [{ title: "Choose your Pages", detail: "Facebook asks which Pages Verdant may use. Tick every Page you want to post to." }]),
    permissions: "Verdant can publish to the Pages you picked and read and answer comments on them. It can't post to your personal profile or read your messages.",
    after: "Each Page appears as its own account. To add another Page later, click Connect again and tick it.",
    trouble: [{ q: "My Page isn't in the list", a: "You need full control (admin) of that Page. Ask the Page owner to give you access in the Page's settings, then connect again." }],
  },
  threads: {
    what: "Post text, photos and videos to Threads (up to 500 characters) and reply to comments.",
    need: ["A Threads profile. Threads signs you in with your Instagram account."],
    steps: signIn("Threads", "threads.com"),
    permissions: "Verdant can publish your posts and read and answer replies to them.",
    after: "Threads allows up to 250 posts a day per profile, which is far more than most people need.",
    trouble: [{ q: "It asks me to log in to Instagram", a: "That's normal: Threads uses your Instagram login." }],
  },
  x: {
    what: "Post to X (text, up to 4 photos or a video) and answer people who mention you.",
    need: ["An X account"],
    steps: signIn("X", "x.com"),
    permissions: "Verdant can post for you and read posts that mention you. It can't read your direct messages or change your password.",
    after: "The counter in Create post shows how much of X's character limit is left.",
    trouble: [{ q: "X shows “Something went wrong”", a: "Wait a minute and click Connect again. If it keeps happening, sign out of X in this browser first." }],
    note: "X only lets apps reply to posts that mention or quote you.",
  },
  youtube: {
    what: "Upload videos to your YouTube channel and reply to comments.",
    need: ["A YouTube channel on your Google account. No channel yet? youtube.com → your picture → Create a channel."],
    steps: signIn("Google", "accounts.google.com", [{ title: "Pick the channel", detail: "If your Google account has more than one channel, choose the one to post to." }]),
    permissions: "Verdant can upload the videos you create here and read and answer comments on your videos. It can't delete your videos or see your Google password.",
    after: "YouTube only takes videos. Add one in the Media section of Create post and give the post a title.",
    trouble: [{ q: "The wrong channel was connected", a: "Disconnect it under Accounts, click Connect again and pick the right channel." }],
  },
  tiktok: {
    what: "Post videos to your TikTok account.",
    need: ["A TikTok account", "Videos in MP4 or MOV format"],
    steps: signIn("TikTok", "tiktok.com"),
    permissions: "Verdant can post the videos you create here and read your basic profile and video stats.",
    after: "Only videos can be posted to TikTok.",
    trouble: [{ q: "I can't log in on the computer", a: "On TikTok's page choose “Use QR code” and scan it with the TikTok app on your phone." }],
  },
  pinterest: {
    what: "Create Pins with your photos on a board you choose.",
    need: ["A Pinterest business account (free: Settings → Account management → Convert to a business account)", "At least one board"],
    steps: signIn("Pinterest", "pinterest.com", []).concat([{ title: "Choose a board", detail: "On Accounts, click Settings on the Pinterest card and pick the board new Pins go to." }]),
    permissions: "Verdant can read your boards and create Pins. It can't delete Pins or change your profile.",
    after: "Every Pin needs an image. Add a link in Create post to send people to your website.",
    trouble: [{ q: "There are no boards to choose", a: "Create a board on Pinterest first, then open Settings on the Pinterest card again." }],
  },
  reddit: {
    what: "Post to your Reddit profile or a subreddit, and reply to comments.",
    need: ["A Reddit account"],
    steps: signIn("Reddit", "reddit.com").concat([{ title: "Optional: pick a subreddit", detail: "On Accounts, click Settings on the Reddit card to choose a subreddit. Otherwise posts go to your profile." }]),
    permissions: "Verdant can submit the posts you create here and read and answer comments on them.",
    after: "Many subreddits don't allow self-promotion. Read each subreddit's rules before posting there.",
    trouble: [{ q: "My post disappeared", a: "The subreddit's moderators or filters removed it. Check its rules, or post to your profile instead." }],
  },
  bluesky: {
    what: "Post text and up to 4 photos to Bluesky, and reply to comments and mentions.",
    need: ["Your Bluesky handle, e.g. yourname.bsky.social", "An app password: a separate password just for apps, which you can delete any time"],
    steps: [
      { title: "Open Bluesky's settings", detail: "In the Bluesky app or at bsky.app: Settings → Privacy and security → App passwords." },
      { title: "Create an app password", detail: "Click Add App Password, name it Verdant and click Create. Copy the password it shows: you'll only see it once." },
      { title: "Connect in Verdant", detail: "Click Connect, enter your handle and paste the app password. Never use your main Bluesky password here." },
    ],
    permissions: "An app password can post and read for your account, but can't change your settings or password. Delete it in Bluesky any time to cut off access.",
    after: "Bluesky posts are limited to 300 characters; the counter in Create post keeps track.",
    trouble: [{ q: "“Invalid identifier or password”", a: "Use the app password, not your login password, and type the handle without an @ at the start." }],
  },
  mastodon: {
    what: "Post text, photos and videos to Mastodon, and reply to comments and mentions.",
    need: ["Your server's address, e.g. https://mastodon.social", "An access token (made in two minutes, steps below)"],
    steps: [
      { title: "Open Development settings", detail: "On your Mastodon server: Preferences → Development → New application." },
      { title: "Create the application", detail: "Name it Verdant, keep the read and write scopes ticked and click Submit." },
      { title: "Copy your access token", detail: "Open the application you just made and copy “Your access token”." },
      { title: "Connect in Verdant", detail: "Click Connect, enter your server's address and paste the token." },
    ],
    permissions: "The token can post and read for your account. Delete the application in Mastodon to cut off access.",
    after: "Your server's character limit is read automatically.",
    trouble: [{ q: "“The token was rejected”", a: "Copy “Your access token” (not the client key or secret), and check the server address matches your account." }],
  },
  telegram: {
    what: "Post text, photos and videos to your Telegram channel through your own bot.",
    need: ["A Telegram channel you own", "A bot (you'll make one in a minute with @BotFather)"],
    steps: [
      { title: "Create a bot", detail: "In Telegram, open @BotFather, send /newbot, then pick a name and a username ending in “bot”. BotFather replies with a token like 123456:ABC…; copy it." },
      { title: "Make the bot a channel admin", detail: "Open your channel → Administrators → Add admin → find your bot → allow it to post messages → Save." },
      { title: "Find your channel's address", detail: "Public channel: its @username. Private channel: its number starting with -100 (bots such as @RawDataBot show it when you forward them a message from the channel)." },
      { title: "Connect in Verdant", detail: "Click Connect and enter the bot token and the channel." },
    ],
    permissions: "The bot can only post in channels where you made it an admin.",
    after: "Posts appear in the channel under the bot's name.",
    trouble: [{ q: "“Bot is not a member of the channel”", a: "Add the bot as an administrator of the channel with permission to post, then connect again." }],
  },
  discord: {
    what: "Post messages and files to a Discord channel.",
    need: ["A Discord server where you can manage webhooks"],
    steps: [
      { title: "Open the channel's settings", detail: "Hover over the channel, click the gear icon, then Integrations → Webhooks." },
      { title: "Create a webhook", detail: "Click New Webhook, name it (for example Verdant) and click Copy Webhook URL." },
      { title: "Connect in Verdant", detail: "Click Connect and paste the URL." },
    ],
    permissions: "A webhook can only post to that one channel. Delete it in Discord to stop it.",
    after: "Posts appear in the channel under the webhook's name.",
    trouble: [{ q: "I don't see Integrations", a: "You need the Manage Webhooks permission on that server. Ask a server admin." }],
  },
  wordpress: {
    what: "Publish blog posts (with a featured image) to your WordPress site and reply to comments.",
    need: ["A WordPress site on HTTPS", "An application password (made in WordPress, steps below)"],
    steps: [
      { title: "Open your profile", detail: "In your WordPress dashboard: Users → Profile, then scroll to Application Passwords." },
      { title: "Create an application password", detail: "Type Verdant as the name and click Add New Application Password. Copy it (the spaces are fine)." },
      { title: "Connect in Verdant", detail: "Click Connect and enter your site address (https://…), your WordPress username and that password." },
    ],
    permissions: "The application password works as your user, so posts appear under your name. Revoke it under Users → Profile any time.",
    after: "Each post becomes a blog post on your site.",
    trouble: [{ q: "I don't see Application Passwords", a: "Your site needs HTTPS, and some security plugins hide the option. Check the plugin's settings or ask your web host." }],
  },
  webhook: {
    what: "Send each post to your own website or an automation tool (Zapier, Make, n8n) as JSON.",
    need: ["An HTTPS address that accepts POST requests", "A signing secret you choose (16+ characters)"],
    steps: [
      { title: "Choose a secret", detail: "Make up a long random value and save it on your server. It proves that requests really come from Verdant." },
      { title: "Connect in Verdant", detail: "Click Connect and enter your address and the same secret. Verdant sends a test message, which must get a 2xx reply." },
      { title: "Check the signature", detail: "Every request carries X-Verdant-Timestamp and X-Verdant-Signature: sha256 HMAC of “timestamp.body” with your secret." },
    ],
    permissions: "Verdant only sends posts you publish to this address.",
    after: "Each published post arrives as one JSON request with its text, link and media URLs.",
    trouble: [{ q: "“Your endpoint rejected the post”", a: "Your address must answer with a 2xx status. Check your server's logs." }],
  },
};

/** Operator setup: developer app per OAuth platform (shown to admins only). */
export interface ServerGuide {
  envKeys: string[];
  portal: string;
  steps: string[];
}

export const SERVER_GUIDES: Partial<Record<Platform, ServerGuide>> = {
  linkedin: {
    envKeys: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    portal: "https://www.linkedin.com/developers/apps",
    steps: ["Create an app (it must be linked to a LinkedIn Page).", "Products: add Sign In with LinkedIn using OpenID Connect and Share on LinkedIn.", "Auth tab: add the redirect URL below, then copy the Client ID and Client Secret."],
  },
  instagram: {
    envKeys: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
    portal: "https://developers.facebook.com/apps",
    steps: ["Create a Business app and add the Instagram product → API setup with Instagram login.", "Add the redirect URL below, plus the deauthorize and data-deletion callbacks.", "Copy the Instagram app ID and secret. Add testers until App Review approves the app."],
  },
  facebook: {
    envKeys: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    portal: "https://developers.facebook.com/apps",
    steps: ["In a Meta app, add Facebook Login for Business.", "Add the redirect URL below.", "Request pages_show_list, pages_read_engagement, pages_manage_posts, pages_read_user_content, pages_manage_engagement and publish_video."],
  },
  threads: {
    envKeys: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
    portal: "https://developers.facebook.com/apps",
    steps: ["Add the Threads API use case to a Meta app.", "Add the redirect URL below.", "Copy the Threads app ID and secret. Add testers until App Review approves the app."],
  },
  youtube: {
    envKeys: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    portal: "https://console.cloud.google.com/apis/credentials",
    steps: ["Enable YouTube Data API v3.", "Create an OAuth client (Web application) with the redirect URL below.", "Publish the OAuth consent screen (in Testing mode, logins expire after 7 days)."],
  },
  tiktok: {
    envKeys: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    portal: "https://developers.tiktok.com",
    steps: ["Create an app with Login Kit and the Content Posting API (Direct Post).", "Add the redirect URL below.", "Apply for the Direct Post audit so posts become public."],
  },
  pinterest: {
    envKeys: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    portal: "https://developers.pinterest.com/apps",
    steps: ["Create an app and add the redirect URL below.", "Apply for Standard access (trial access creates sandbox Pins)."],
  },
  reddit: {
    envKeys: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USERNAME"],
    portal: "https://www.reddit.com/prefs/apps",
    steps: ["Request API access under Reddit's Responsible Builder Policy (approval is required).", "Create a web app with the redirect URL below.", "Set REDDIT_USERNAME to your Reddit username (used in the required User-Agent)."],
  },
  x: {
    envKeys: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    portal: "https://console.x.com",
    steps: ["User authentication settings: Read and write, Web App (confidential client).", "Add the redirect URL below as the callback.", "Copy the OAuth 2.0 Client ID and Secret, and add pay-per-use credits."],
  },
};
