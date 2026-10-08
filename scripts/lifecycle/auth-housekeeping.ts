import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { purgeExpiredAuthMetadata } from "../../src/platform/auth/housekeeping";
async function main() {
  loadEnvFile(".env.auth-maintenance");
  const url = process.env.AUTH_MAINTENANCE_DATABASE_URL;
  if (!url || new URL(url).username !== "auth_adapter")
    throw new Error("Configuration");
  const client = new Client({
    connectionString: url,
    application_name: "pmp-auth-housekeeping",
  });
  try {
    await client.connect();
    console.log(JSON.stringify(await purgeExpiredAuthMetadata(client)));
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Auth housekeeping failed. No credentials or token details are logged.",
  );
  process.exitCode = 1;
});
