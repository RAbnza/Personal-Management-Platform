import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

async function main() {
  loadEnvFile(".env.test");
  const name = `pmp_trackers_verify_${randomBytes(6).toString("hex")}`;
  assert.match(name, /^pmp_trackers_verify_[a-f0-9]{12}$/);
  const admin = new Client({
    connectionString: process.env.TEST_DATABASE_ADMIN_URL,
  });
  const url = new URL(process.env.DATABASE_MIGRATION_URL!);
  url.pathname = `/${name}`;
  assert.equal(url.username, "migration_owner");
  const client = new Client({ connectionString: url.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}" OWNER migration_owner`);
    created = true;
    await admin.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT ON DATABASE "${name}" TO app_domain,auth_adapter,worker_domain,queue_broker,lifecycle_operator`,
    );
    await client.connect();
    const files = readMigrationFiles({
      migrationsFolder: "src/platform/db/migrations",
    });
    const journal = JSON.parse(
      await readFile("src/platform/db/migrations/meta/_journal.json", "utf8"),
    ) as { entries: { tag: string }[] };
    assert.equal(journal.entries[201]?.tag, "0201_v3_tracker_security");
    const snapshot = JSON.parse(
      await readFile(
        "src/platform/db/migrations/meta/0201_snapshot.json",
        "utf8",
      ),
    ) as { tables: Record<string, unknown> };
    assert.equal(Object.keys(snapshot.tables).length, 125);
    const apply = async (start: number, end: number) => {
      for (const f of files.slice(start, end)) {
        await client.query("BEGIN");
        try {
          for (const statement of f.sql) await client.query(statement);
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        }
      }
    };
    await apply(0, 202);
    await client.query(
      "CREATE TABLE public.tracker_upgrade_sentinel(value bigint NOT NULL); INSERT INTO public.tracker_upgrade_sentinel VALUES(9223372036854775807)",
    );
    await apply(202, files.length);
    assert.equal(
      (
        await client.query(
          "SELECT value::text FROM public.tracker_upgrade_sentinel",
        )
      ).rows[0].value,
      "9223372036854775807",
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tracker' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity",
        )
      ).rows[0].n,
      9,
    );
    assert.deepEqual(
      (
        await client.query(
          "SELECT condeferrable,condeferred FROM pg_constraint WHERE conname='tracker_entry_current_fk' AND conrelid='tracker.entry'::regclass",
        )
      ).rows,
      [{ condeferrable: true, condeferred: true }],
    );
    for (const role of ["auth_adapter", "queue_broker"])
      assert.equal(
        (
          await client.query(
            "SELECT has_schema_privilege($1,'tracker','usage') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    assert.equal(
      (
        await client.query(
          "SELECT has_table_privilege('app_domain','tracker.entry','DELETE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await client.query(
          "SELECT has_table_privilege('app_domain','tracker.entry_revision','UPDATE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    assert.deepEqual(
      (
        await client.query(
          "SELECT c.relname name,has_table_privilege('worker_domain',c.oid,'SELECT') allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tracker' AND c.relkind='r' ORDER BY c.relname",
        )
      ).rows,
      [
        "entry",
        "entry_revision",
        "field_definition",
        "field_identity",
        "field_option",
        "template",
        "template_migration",
        "template_version",
        "tracker",
      ].map((name) => ({ name, allowed: ["entry", "tracker"].includes(name) })),
    );
    // Register the manually applied actual chain and prove no-change migrator replay.
    await client.query(
      "CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)",
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
      files.length,
    );
    console.log(
      `Focused tracker schema verification passed: ${files.length} fresh migrations, accepted 125-table/202-migration V3-A/B baseline, bigint sentinel upgrade, no-change replay, nine forced-RLS tables, restricted grants and deferred current-entry FK.`,
    );
  } finally {
    await client.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(
    `Focused tracker migration verification failed: ${e instanceof Error ? e.message : "unknown"}`,
  );
  process.exitCode = 1;
});
