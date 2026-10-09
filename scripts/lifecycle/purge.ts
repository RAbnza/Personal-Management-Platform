import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { z } from "zod";
import { purgeDeletionStep } from "../../src/platform/lifecycle/purge";
import { publishDeletionCheckpoint } from "../../src/platform/lifecycle/publish-deletion-checkpoint";

async function main() {
  loadEnvFile(".env.lifecycle");
  const connectionString = process.env.LIFECYCLE_DATABASE_URL;
  if (
    !connectionString ||
    new URL(connectionString).username !== "lifecycle_operator"
  )
    throw new Error(
      "LIFECYCLE_DATABASE_URL must use the separate lifecycle_operator role.",
    );
  const requestId = process.argv[2] ?? "";
  z.uuid().parse(requestId);
  const deployment = z
    .enum(["local", "test", "staging", "production"])
    .parse(process.env.PMP_DEPLOYMENT_ENV);
  if (
    ["staging", "production"].includes(deployment) &&
    new URL(connectionString).searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Deployed lifecycle connections require verified TLS.");
  const rowBudget = Number(process.argv[3] ?? "10000");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    application_name: "pmp-lifecycle-purge",
  });
  try {
    await client.connect();
    if (["staging", "production"].includes(deployment)) {
      const request = (
        await client.query(
          "SELECT target_user_id,target_workspace_id,requested_at,purge_after,state FROM ops.deletion_request WHERE id=$1",
          [requestId],
        )
      ).rows[0];
      if (!request) throw new Error("Deletion request unavailable.");
      if (request.state !== "completed")
        await publishDeletionCheckpoint({
          schemaVersion: 1,
          requestId,
          targetUserId: request.target_user_id,
          targetWorkspaceId: request.target_workspace_id,
          requestedAt: request.requested_at.toISOString(),
          purgeAfter: request.purge_after.toISOString(),
        });
    }
    const result = await purgeDeletionStep(client, requestId, rowBudget);
    console.log(JSON.stringify({ requestId, ...result }));
  } catch {
    console.error(
      "Lifecycle step failed. The request remains blocked; review its checkpoint and retry through the operator process.",
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Lifecycle operator configuration is invalid.");
  process.exitCode = 1;
});
