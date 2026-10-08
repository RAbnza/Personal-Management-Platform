import { getAuthPool } from "@/platform/db/pools";
import { getSessionAbsoluteExpiresAt } from "./session-policy";
import { getVerifiedAuthenticatedSession } from "./session-boundary";
import { auth } from "./server";

export function describeDevice(agent: string | null) {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iOS"
      : /Windows/.test(agent)
        ? "Windows"
        : /Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "unknown device";
  return `${browser} on ${os}`;
}
export async function listOwnerSessions(requestHeaders: Headers) {
  const current = await getVerifiedAuthenticatedSession(requestHeaders);
  if (!current) return null;
  const rows = await getAuthPool().query<{
    id: string;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
    user_agent: string | null;
  }>(
    `
    SELECT id,created_at,updated_at,expires_at,user_agent FROM auth.session
    WHERE user_id=$1 AND expires_at>clock_timestamp() AND created_at>clock_timestamp()-interval '30 days'
    ORDER BY created_at DESC LIMIT 100`,
    [current.user.id],
  );
  return rows.rows.map((r) => ({
    id: r.id,
    current: r.id === current.session.id,
    device: describeDevice(r.user_agent),
    createdAt: r.created_at.toISOString(),
    lastActiveAt: r.updated_at.toISOString(),
    expiresAt: new Date(
      Math.min(
        r.expires_at.getTime(),
        getSessionAbsoluteExpiresAt(r.created_at).getTime(),
      ),
    ).toISOString(),
  }));
}
export async function revokeOwnerSessions(
  requestHeaders: Headers,
  target: { kind: "all" | "others" } | { kind: "one"; sessionId: string },
) {
  const current = await getVerifiedAuthenticatedSession(requestHeaders);
  if (!current) return null;
  if (target.kind === "all")
    await auth.api.revokeSessions({ headers: requestHeaders });
  else if (target.kind === "others")
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
  else if (target.kind === "one") {
    const row = await getAuthPool().query<{ token: string }>(
      "SELECT token FROM auth.session WHERE id=$1 AND user_id=$2",
      [target.sessionId, current.user.id],
    );
    if (!row.rows[0]) return { found: false, signedOut: false };
    await auth.api.revokeSession({
      headers: requestHeaders,
      body: { token: row.rows[0].token },
    });
  }
  return {
    found: true,
    signedOut:
      target.kind === "all" ||
      (target.kind === "one" && target.sessionId === current.session.id),
  };
}
