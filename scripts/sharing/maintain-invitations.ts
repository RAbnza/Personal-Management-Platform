import { loadEnvFile } from "node:process";
import { Client } from "pg";
async function main() {
  loadEnvFile(".env.lifecycle");
  const connection = process.env.LIFECYCLE_DATABASE_URL;
  if (!connection || new URL(connection).username !== "lifecycle_operator")
    throw new Error("Separate lifecycle_operator connection required.");
  if (
    ["staging", "production"].includes(process.env.PMP_DEPLOYMENT_ENV ?? "") &&
    new URL(connection).searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Verified deployment TLS required.");
  const c = new Client({
    connectionString: connection,
    connectionTimeoutMillis: 5000,
    application_name: "pmp-sharing-invitation-maintenance",
  });
  try {
    await c.connect();
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    const result = await c.query(
      "SELECT sharing.maintain_invitations(100) AS result",
    );
    await c.query("COMMIT");
    console.log(JSON.stringify(result.rows[0].result));
  } finally {
    await c.end();
  }
}
main().catch(() => {
  console.error(
    "Invitation maintenance failed. Review operator connectivity and scheduling; no contacts or credentials are logged.",
  );
  process.exitCode = 1;
});
