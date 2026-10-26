import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { authAccounts, sessions, users, verifications } from "@/server/db/schema";
import { env } from "@/server/env";
import { actionEmail, sendMail } from "@/server/mailer";
import { ensurePersonalWorkspace } from "@/server/workspaces/service";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Verdant",
    baseURL: e.APP_BASE_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_BASE_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: authAccounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const m = actionEmail("Reset your password", "We received a request to reset your Verdant password.", url, "Reset password");
        await sendMail({ to: user.email, subject: "Reset your Verdant password", ...m });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const m = actionEmail("Verify your email", "Confirm your email address to secure your Verdant account.", url, "Verify email");
        await sendMail({ to: user.email, subject: "Verify your Verdant email", ...m });
      },
    },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: {
      useSecureCookies: e.NODE_ENV === "production",
      cookiePrefix: "verdant",
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensurePersonalWorkspace({ id: user.id, name: user.name, email: user.email });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
