import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { z } from "zod";
import {
  encryptBackup,
  decryptBackup,
} from "../../src/platform/backup/envelope";
import { createBackupObjectStore } from "../../src/platform/backup/object-store";

async function main() {
  try {
    loadEnvFile(".env.backup");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const env = z
    .object({
      BACKUP_DATABASE_URL: z.url(),
      BACKUP_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
      BACKUP_ENCRYPTION_KEY_ID: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
      PMP_DEPLOYMENT_ENV: z.enum(["staging", "production"]),
    })
    .parse(process.env);
  const url = new URL(env.BACKUP_DATABASE_URL);
  if (
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    [
      "app_domain",
      "auth_adapter",
      "queue_broker",
      "worker_domain",
      "lifecycle_operator",
    ].includes(decodeURIComponent(url.username))
  )
    throw new Error("Controlled backup identity with verified TLS required.");
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
    options: "-c statement_timeout=15000 -c lock_timeout=5000",
    application_name: "pmp-controlled-backup",
  });
  let migrationCount: number;
  await client.connect();
  try {
    const role = (
      await client.query(
        "SELECT rolbypassrls OR rolsuper AS permitted FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    if (!role?.permitted)
      throw new Error("Backup operator cannot read complete forced-RLS data.");
    const major = (
      await client.query(
        "SELECT current_setting('server_version_num')::int / 10000 AS major",
      )
    ).rows[0].major;
    if (major !== 17)
      throw new Error("Reviewed PostgreSQL 17 backup tooling required.");
    migrationCount = (
      await client.query(
        "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
      )
    ).rows[0].count;
  } finally {
    await client.end();
  }
  // Password and certificate settings travel through the child's private
  // environment, never command arguments, logs or a shell.
  const child = spawn("pg_dump", ["--format=custom", "--no-password"], {
    shell: false,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "production",
      PATH: process.env.PATH,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: process.env.PGSSLROOTCERT,
    },
  });
  const parts: Buffer[] = [];
  let size = 0;
  const completed = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("Backup tool unavailable.")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Logical backup failed.")),
    );
  });
  child.stderr.resume(); // Never emit provider/SQL/credential diagnostics.
  child.stdout.on("data", (part: Buffer) => {
    size += part.length;
    if (size > 256 * 1024 * 1024) {
      child.kill();
      return;
    }
    parts.push(part);
  });
  const timeout = setTimeout(() => child.kill(), 30 * 60 * 1000);
  try {
    await completed;
  } finally {
    clearTimeout(timeout);
  }
  if (size > 256 * 1024 * 1024 || size < 5)
    throw new Error("Backup exceeds reviewed bounded operator capacity.");
  const dump = Buffer.concat(parts),
    backupId = randomUUID(),
    completedAt = new Date().toISOString();
  const metadata = {
    schemaVersion: 1 as const,
    backupId,
    keyId: env.BACKUP_ENCRYPTION_KEY_ID,
  };
  const encrypted = encryptBackup(dump, metadata, env.BACKUP_ENCRYPTION_KEY);
  const key = `v1-backups/${completedAt.slice(0, 10)}/${backupId}.pmpbackup`,
    store = createBackupObjectStore();
  await store.putOnce(key, encrypted);
  const readback = await store.read(key);
  if (
    !decryptBackup(
      readback,
      env.BACKUP_ENCRYPTION_KEY,
      metadata.keyId,
    ).dump.equals(dump)
  )
    throw new Error("Backup recovery verification failed.");
  await store.putOnce(
    key + ".json",
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        backupId,
        completedAt,
        keyId: metadata.keyId,
        migrationCount,
        bytes: encrypted.length,
        sha256: createHash("sha256").update(encrypted).digest("hex"),
      }),
    ),
  );
  console.log(
    JSON.stringify({ code: "backup_verified", backupId, completedAt }),
  );
}
void main().catch(() => {
  console.error(JSON.stringify({ code: "backup_failed" }));
  process.exitCode = 1;
});
