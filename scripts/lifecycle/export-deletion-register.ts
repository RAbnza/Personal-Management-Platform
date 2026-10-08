import { loadEnvFile } from "node:process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
async function main() {
  loadEnvFile(".env.lifecycle");
  const url = process.env.LIFECYCLE_DATABASE_URL;
  if (
    !url ||
    new URL(url).username !== "lifecycle_operator" ||
    !process.argv[2]
  )
    throw new Error("Configuration");
  const client = new Client({
    connectionString: url,
    application_name: "pmp-deletion-register",
  });
  try {
    await client.connect();
    const records = await client.query<{ id: string }>(
      `SELECT id,target_user_id,target_workspace_id,request_id,purged_at,expires_at FROM ops.deletion_tombstone ORDER BY purged_at,id`,
    );
    // Never overwrite an independently retained register. Contains IDs/dates
    // only, no contact details, counts, notes, credentials or financial content.
    await writeFile(
      resolve(process.argv[2]!),
      records.rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await client.query(
      "UPDATE ops.deletion_tombstone SET register_exported_at=clock_timestamp() WHERE id=ANY($1::uuid[]) AND register_exported_at IS NULL",
      [records.rows.map((r) => r.id)],
    );
    console.log(
      `Deletion register exported: ${records.rowCount} minimal tombstones. Store this file independently of database backups before a restore is reopened.`,
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Deletion register export failed. No retained register was overwritten.",
  );
  process.exitCode = 1;
});
