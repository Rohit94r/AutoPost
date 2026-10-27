import type { Platform } from "./platforms";

/**
 * Plain-language "how to connect" steps for people connecting their own accounts (Get started
 * page). Server-side developer-app setup for the operator lives in SERVER_GUIDES below.
 */
export interface ConnectGuide {
  /** What the person needs before starting. */
  need: string[];
  steps: string[];
  /** Limits worth knowing up front. */
  note?: string;
}

const signIn = (site: string, extra: string[] = []): string[] => [`Click Connect. You're sent to ${site}.`, `Sign in and click Allow to approve the permissions shown.`, ...extra, "You come back here with the account connected."];

export const CONNECT_GUIDES: Record<Platform, ConnectGuide> = {
  linkedin: {
    need: ["A LinkedIn account"],
    steps: signIn("LinkedIn"),
    note: "Posts go to your personal profile. Company pages need extra approval from LinkedIn.",
  },
  instagram: {
    need: ["An Instagram Business or Creator account. It's free: Instagram app → Settings → Account type and tools → Switch to professional account."],
    steps: signIn("Instagram"),
    note: "Personal Instagram accounts can't be used: Instagram only allows publishing for professional accounts.",
  },
  facebook: {
    need: ["A Facebook Page you manage (personal profiles can't be posted to)"],
    steps: signIn("Facebook", ["Choose the Pages you want to post to."]),
    note: "Each Page you choose becomes its own account here.",
  },
  threads: { need: ["A Threads profile"], steps: signIn("Threads") },
  x: {
    need: ["An X account"],
    steps: signIn("X"),
    note: "X only lets apps reply to posts that mention or quote you.",
  },
  youtube: {
    need: ["A YouTube channel on your Google account"],
    steps: signIn("Google", ["Pick the channel to use."]),
    note: "YouTube takes videos only, and allows about 100 uploads a day per app.",
  },
  tiktok: {
    need: ["A TikTok account"],
    steps: signIn("TikTok"),
    note: "Until TikTok approves this app, new posts are visible only to you.",
  },
  pinterest: {
    need: ["A Pinterest business account (free to switch)", "At least one board"],
    steps: signIn("Pinterest", ["Then open Accounts → Settings on the Pinterest card and pick the board to post to."]),
  },
  reddit: {
    need: ["A Reddit account"],
    steps: signIn("Reddit", ["Optional: set a subreddit under Accounts → Settings (otherwise posts go to your profile)."]),
    note: "Respect each subreddit's rules about self-promotion.",
  },
  bluesky: {
    need: ["Your Bluesky handle", "An app password (not your login password)"],
    steps: [
      "In Bluesky, open Settings → Privacy and security → App passwords → Add App Password.",
      "Name it Verdant and copy the password it shows.",
      "Click Connect and enter your handle and that app password.",
    ],
  },
  mastodon: {
    need: ["Your server address, e.g. https://mastodon.social", "An access token"],
    steps: [
      "On your Mastodon server, open Preferences → Development → New application.",
      "Name it Verdant, keep the read and write scopes, and save.",
      "Open the application and copy “Your access token”.",
      "Click Connect and paste your server address and the token.",
    ],
  },
  telegram: {
    need: ["A Telegram channel you own", "A bot token"],
    steps: [
      "In Telegram, message @BotFather, send /newbot and follow the prompts. Copy the token it gives you.",
      "Open your channel → Administrators → Add admin, and add your bot with permission to post.",
      "Click Connect and enter the bot token and your channel (@channelname, or the -100… ID of a private channel).",
    ],
  },
  discord: {
    need: ["A Discord server where you can manage webhooks"],
    steps: ["Open the channel's settings → Integrations → Webhooks → New Webhook.", "Click Copy Webhook URL.", "Click Connect and paste the URL."],
  },
  wordpress: {
    need: ["A WordPress site on HTTPS", "An application password"],
    steps: [
      "In WordPress, go to Users → Profile → Application Passwords.",
      "Type Verdant as the name, click Add New Application Password and copy it.",
      "Click Connect and enter your site address, your WordPress username and that password.",
    ],
  },
  webhook: {
    need: ["An HTTPS address on your website that accepts POST requests"],
    steps: [
      "Make up a long random signing secret (16+ characters) and store it on your server.",
      "Click Connect and enter your endpoint address and the same secret.",
      "Verdant sends a test ping, then POSTs each post as JSON. Check the X-Verdant-Signature header with your secret.",
    ],
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
