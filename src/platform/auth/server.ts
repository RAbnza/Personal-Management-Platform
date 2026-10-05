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

import {
  SESSION_EXPIRY_SECONDS,
  SESSION_FRESH_AGE_SECONDS,
  SESSION_REFRESH_AGE_SECONDS,
} from "./session-policy";

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
 *
 * Verification and recovery email delivery is added in the next authentication
 * milestone before registration/recovery flows are exercised.
 */
export const auth = betterAuth({
  database: drizzleAdapter(authDatabase, {
    provider: "pg",
    schema: betterAuthSchema,
    schemaName: "auth",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
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
