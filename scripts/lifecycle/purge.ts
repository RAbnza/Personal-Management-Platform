import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { purgeDeletionStep } from "../../src/platform/lifecycle/purge";

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
  const rowBudget = Number(process.argv[3] ?? "10000");
  const client = new Client({
    connectionString,
    application_name: "pmp-lifecycle-purge",
  });
  try {
    await client.connect();
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
