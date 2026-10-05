import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { drizzle } from "drizzle-orm/node-postgres";

import { getAuthPool } from "@/platform/db/pools";
import {
  account,
  rate_limit,
  session,
  user,
  verification,
} from "@/platform/db/schema/auth.generated";
import { getServerEnvironment } from "@/platform/env/server";

import {
  sendAuthPasswordResetEmail,
  sendAuthVerificationEmail,
} from "./email-delivery";
import { AUTH_EMAIL_LINK_EXPIRY_SECONDS } from "./email-links";
import {
  SESSION_EXPIRY_SECONDS,
  SESSION_FRESH_AGE_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
} from "./session-policy";

const environment = getServerEnvironment();

const betterAuthSchema = {
  user,
  session,
  account,
  verification,
  rate_limit,
};

const authDatabase = drizzle({
  client: getAuthPool(),
  schema: betterAuthSchema,
});

/**
 * Server-owned Better Auth instance.
 *
 * This is the authoritative runtime authentication configuration. The schema
 * generation entry point re-exports this same instance so runtime behavior and
 * generated Better Auth database fields cannot silently drift apart.
 */
export const auth = betterAuth({
  secret: environment.BETTER_AUTH_SECRET,
  baseURL: environment.BETTER_AUTH_URL,

  /*
   * The application is same-origin. Redirect-bearing authentication operations
   * therefore accept only the configured application origin.
   */
  trustedOrigins: [new URL(environment.BETTER_AUTH_URL).origin],

  database: drizzleAdapter(authDatabase, {
    provider: "pg",
    schema: betterAuthSchema,
    schemaName: "auth",
  }),

  emailVerification: {
    /*
     * The project deliberately uses the raw Better Auth token to construct a
     * fragment-based application link. Bearer tokens therefore do not appear
     * in ordinary HTTP request URLs, access logs or referrer headers.
     */
    sendVerificationEmail: async ({ user, token }) => {
      await sendAuthVerificationEmail({
        to: user.email,
        token,
      });
    },

    sendOnSignUp: true,
    sendOnSignIn: true,

    /*
     * The documented flow is:
     * registration -> verification -> explicit verified sign-in.
     */
    autoSignInAfterVerification: false,

    expiresIn: AUTH_EMAIL_LINK_EXPIRY_SECONDS,
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,

    sendResetPassword: async ({ user, token }) => {
      await sendAuthPasswordResetEmail({
        to: user.email,
        token,
      });
    },

    resetPasswordTokenExpiresIn: AUTH_EMAIL_LINK_EXPIRY_SECONDS,
    revokeSessionsOnPasswordReset: true,
  },

  session: {
    expiresIn: SESSION_EXPIRY_SECONDS,
    updateAge: SESSION_REFRESH_AGE_SECONDS,
    freshAge: SESSION_FRESH_AGE_SECONDS,

    cookieCache: {
      enabled: false,
    },
  },

  rateLimit: {
    storage: "database",
    modelName: "rate_limit",
  },

  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
