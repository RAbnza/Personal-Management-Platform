import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { z } from "zod";
import { getAuthPool } from "@/platform/db/pools";
import { isSessionWithinAbsoluteLifetime } from "./session-policy";

/** Routed through Better Auth's origin protection and persistent rate limiter.
 * Renewal never writes this proof. Password verification uses library primitives.
 */
export const reauthenticationPlugin = {
  id: "workspace-reauthentication",
  endpoints: {
    reauthenticate: createAuthEndpoint(
      "/reauthenticate",
      {
        method: "POST",
        body: z.object({ password: z.string().min(1).max(128) }).strict(),
        use: [sensitiveSessionMiddleware],
        requireHeaders: true,
      },
      async (ctx) => {
        const current = ctx.context.session;
        if (
          !current.user.emailVerified ||
          !isSessionWithinAbsoluteLifetime(current.session.createdAt)
        ) {
          throw new APIError("UNAUTHORIZED", { message: "Sign in again." });
        }
        const credential =
          await ctx.context.internalAdapter.findCredentialAccount(
            current.user.id,
          );
        if (
          !credential?.password ||
          !(await ctx.context.password.verify({
            hash: credential.password,
            password: ctx.body.password,
          }))
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Password could not be verified.",
          });
        }
        const proof = await getAuthPool().query(
          `
        INSERT INTO auth.session_assurance(session_id, verified_at, method)
        SELECT id, clock_timestamp(), 'password' FROM auth.session
        WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()
        ON CONFLICT(session_id) DO UPDATE SET verified_at=EXCLUDED.verified_at, method='password'
        RETURNING session_id`,
          [current.session.id, current.user.id],
        );
        if (!proof.rowCount)
          throw new APIError("UNAUTHORIZED", { message: "Sign in again." });
        return ctx.json({ status: true });
      },
    ),
  },
};
