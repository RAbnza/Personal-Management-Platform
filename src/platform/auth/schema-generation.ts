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
 * Better Auth configuration used as the authoritative input for generating its
 * library-owned Drizzle schema.
 *
 * Email delivery callbacks and Next.js route integration are added when the
 * runtime auth boundary is implemented. They do not change this core schema.
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

    /*
     * Protected requests must observe database-backed revocation immediately.
     * Better Auth otherwise keeps cookie caching disabled by default, but the
     * explicit setting records the project's security requirement here.
     */
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
