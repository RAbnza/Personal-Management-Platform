import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
async function main() {
  loadEnvFile(".env.test");
  const name = `pmp_sharing_verify_${randomBytes(6).toString("hex")}`;
  assert.match(name, /^pmp_sharing_verify_[a-f0-9]{12}$/);
  const admin = new Client({
    connectionString: process.env.TEST_DATABASE_ADMIN_URL,
  });
  await admin.connect();
  let created = false;
  const connect = (base: string) => {
    const u = new URL(base);
    u.pathname = `/${name}`;
    return u.toString();
  };
  const client = new Client({
    connectionString: connect(process.env.DATABASE_MIGRATION_URL!),
  });
  try {
    await admin.query(`CREATE DATABASE "${name}" OWNER migration_owner`);
    created = true;
    await admin.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT ON DATABASE "${name}" TO app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator`,
    );
    await client.connect();
    const files = readMigrationFiles({
        migrationsFolder: "src/platform/db/migrations",
      }),
      journal = JSON.parse(
        await readFile("src/platform/db/migrations/meta/_journal.json", "utf8"),
      ) as { entries: { idx: number }[] };
    // Empty -> accepted H baseline, then a sentinel upgrade through only I.
    for (const migration of files.slice(0, 156)) {
      await client.query("BEGIN");
      try {
        for (const statement of migration.sql) await client.query(statement);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    await client.query(
      "CREATE TABLE public.sharing_upgrade_sentinel(amount bigint NOT NULL); INSERT INTO public.sharing_upgrade_sentinel VALUES(9223372036854775807)",
    );
    for (const migration of files.slice(156)) {
      await client.query("BEGIN");
      try {
        for (const statement of migration.sql) await client.query(statement);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    assert.equal(
      (
        await client.query(
          "SELECT amount::text FROM public.sharing_upgrade_sentinel",
        )
      ).rows[0].amount,
      "9223372036854775807",
    );
    // Register the actual chain, then exercise the migrator's no-op replay.
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(
      "CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
    );
    for (const f of files)
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
        [f.hash, f.folderMillis],
      );
    await migrate(drizzle({ client }), {
      migrationsFolder: "src/platform/db/migrations",
    });
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int n FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
      journal.entries.length,
    );
    const count = await client.query(
      "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname='sharing' OR n.nspname='finance' AND c.relname IN('group_ledger_binding','private_group_link','private_group_link_revision','private_group_review') OR n.nspname='audit' AND c.relname='group_revision' OR n.nspname='ops' AND c.relname='shared_bundle_proof') AND c.relrowsecurity AND c.relforcerowsecurity",
    );
    assert.equal(count.rows[0].n, 22);
    assert.deepEqual(
      (
        await client.query(
          "SELECT condeferrable,condeferred FROM pg_constraint WHERE conrelid='finance.private_group_link_revision'::regclass AND conname='fk_private_link_previous'",
        )
      ).rows,
      [{ condeferrable: true, condeferred: true }],
    );
    console.log(
      `Sharing migration verification passed: ${files.length} migrations; H-to-I sentinel preserved; replay unchanged; 22 new tables force RLS.`,
    );
  } finally {
    await client.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(
    `Focused sharing migration verification failed: ${e instanceof Error ? e.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
