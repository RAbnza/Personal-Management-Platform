import { auth } from "./server";
import { isSessionWithinAbsoluteLifetime } from "./session-policy";

/**
 * Resolve the current authoritative Better Auth session for protected domain
 * work.
 *
 * Protected application work requires:
 *
 * - an active database-backed Better Auth session;
 * - a verified email address;
 * - a session still inside the application's thirty-day absolute lifetime.
 *
 * Absolute-expired sessions are denied even if Better Auth's sliding
 * expiration would otherwise still consider them active.
 */
export async function getVerifiedAuthenticatedSession(requestHeaders: Headers) {
  const currentSession = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!currentSession || !currentSession.user.emailVerified) {
    return null;
  }

  if (!isSessionWithinAbsoluteLifetime(currentSession.session.createdAt)) {
    try {
      await auth.api.revokeSession({
        headers: requestHeaders,
        body: {
          token: currentSession.session.token,
        },
      });
    } catch {
      /*
       * Authorization must still fail even if cleanup cannot complete.
       * Do not log the token or the underlying authentication error.
       */
      console.error(
        "Failed to revoke an authentication session that exceeded its absolute lifetime.",
      );
    }

    return null;
  }

  return currentSession;
}
