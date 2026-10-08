import type { Pool, Client } from "pg";
import { z } from "zod";
export async function purgeExpiredAuthMetadata(
  client: Pool | Client,
  limit = 500,
) {
  z.number().int().min(1).max(1000).parse(limit);
  const role = await client.query<{ role: string }>(
    "SELECT current_user AS role",
  );
  if (role.rows[0]?.role !== "auth_adapter")
    throw new Error("Auth housekeeping requires auth_adapter.");
  const sessions = await client.query(
    `DELETE FROM auth.session WHERE (expires_at<=clock_timestamp() OR created_at<=clock_timestamp()-interval '30 days') AND id IN(SELECT id FROM auth.session WHERE expires_at<=clock_timestamp() OR created_at<=clock_timestamp()-interval '30 days' ORDER BY created_at LIMIT $1)`,
    [limit],
  );
  const proofs = await client.query(
    `DELETE FROM auth.session_assurance WHERE verified_at<=clock_timestamp()-interval '5 minutes' AND session_id IN(SELECT session_id FROM auth.session_assurance WHERE verified_at<=clock_timestamp()-interval '5 minutes' ORDER BY verified_at LIMIT $1)`,
    [limit],
  );
  const tokens = await client.query(
    `DELETE FROM auth.verification WHERE expires_at<=clock_timestamp() AND id IN(SELECT id FROM auth.verification WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1)`,
    [limit],
  );
  // Inactive library counters are security metadata, not owner records. This
  // conservative TTL exceeds every configured auth rate-limit window.
  const rateLimits = await client.query(
    `DELETE FROM auth.rate_limit WHERE last_request <= floor(extract(epoch FROM clock_timestamp()-interval '30 days')*1000)::bigint AND id IN(SELECT id FROM auth.rate_limit WHERE last_request <= floor(extract(epoch FROM clock_timestamp()-interval '30 days')*1000)::bigint ORDER BY last_request LIMIT $1)`,
    [limit],
  );
  return {
    sessions: sessions.rowCount ?? 0,
    proofs: proofs.rowCount ?? 0,
    tokens: tokens.rowCount ?? 0,
    rateLimits: rateLimits.rowCount ?? 0,
  };
}
