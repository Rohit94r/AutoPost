import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy: scripts/styles from self only (Next needs 'unsafe-inline' for its
// bootstrap scripts unless nonces are used). Images may come from the configured storage CDN.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.linkedin.com https://www.instagram.com https://x.com https://twitter.com https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pino", "bullmq", "ioredis", "unpdf", "postgres"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // Pages merged in the v2 navigation: AI studio + Documents → Create post, Library → History, Autopilot → Inbox.
  async redirects() {
    return [
      { source: "/studio", destination: "/compose", permanent: true },
      { source: "/documents", destination: "/compose?start=document", permanent: true },
      { source: "/documents/:id", destination: "/compose?document=:id", permanent: true },
      { source: "/library", destination: "/history?tab=posts", permanent: true },
      { source: "/autopilot", destination: "/inbox?tab=autopilot", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private document previews are embedded same-origin on the review page.
      {
        source: "/api/v1/documents/:id/file",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
