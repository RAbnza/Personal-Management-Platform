import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { afterAll, expect, it } from "vitest";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";
afterAll(closeRuntimeDatabasePools);
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
it("inventories every private table/view and verifies forced RLS, absent/spoofed scope and real role boundaries", async () => {
  const catalog = new Client({
    connectionString: process.env.DATABASE_MIGRATION_URL,
  });
  await catalog.connect();
  const userId = randomUUID();
  await getAuthPool().query(
    "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'Catalog fixture',$2,true)",
    [userId, `${userId}@example.test`],
  );
  const { workspaceId } = await provisionPersonalWorkspace({
    userId,
    displayName: "Catalog fixture",
  });
  try {
    const relations = (
      await catalog.query(
        `SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('app_domain',c.oid,'SELECT') AS app_read,
      has_table_privilege('auth_adapter',c.oid,'SELECT') AS auth_read,
      has_table_privilege('queue_broker',c.oid,'SELECT') AS queue_read,
      pg_get_userbyid(c.relowner) AS owner,c.reloptions
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m') ORDER BY n.nspname,c.relname`,
        [["core", "finance", "career", "time", "audit", "auth", "ops"]],
      )
    ).rows;
    expect(relations.length).toBeGreaterThanOrEqual(57);
    const runtime = await getDomainPool().connect();
    try {
      for (const row of relations) {
        const qualified = `${quote(row.schema)}.${quote(row.name)}`;
        expect(row.owner, qualified).toBe("migration_owner");
        if (
          ["core", "finance", "career", "time", "audit"].includes(row.schema)
        ) {
          expect(row.auth_read, qualified).toBe(false);
          expect(row.queue_read, qualified).toBe(false);
        }
        if (row.app_read) {
          if (row.relkind === "v")
            expect(row.reloptions, qualified).toContain(
              "security_invoker=true",
            );
          else {
            expect(row.relrowsecurity, qualified).toBe(true);
            expect(row.relforcerowsecurity, qualified).toBe(true);
          }
          expect(
            (await runtime.query(`SELECT * FROM ${qualified} LIMIT 1`)).rows,
            `${qualified}: no context`,
          ).toHaveLength(0);
          await runtime.query("BEGIN");
          await runtime.query(
            "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
            [randomUUID(), workspaceId],
          );
          expect(
            (await runtime.query(`SELECT * FROM ${qualified} LIMIT 1`)).rows,
            `${qualified}: foreign workspace`,
          ).toHaveLength(0);
          await runtime.query("ROLLBACK");
        } else
          await expect(
            runtime.query(`SELECT * FROM ${qualified} LIMIT 1`),
            qualified,
          ).rejects.toMatchObject({ code: "42501" });
      }
    } finally {
      await runtime.query("ROLLBACK");
      runtime.release();
    }
    const bootstrap = parseEnv(await readFile(".env.bootstrap", "utf8"));
    for (const [role, key] of [
      ["auth_adapter", "AUTH_ADAPTER_PASSWORD"],
      ["queue_broker", "QUEUE_BROKER_PASSWORD"],
      ["worker_domain", "WORKER_DOMAIN_PASSWORD"],
      ["lifecycle_operator", "LIFECYCLE_OPERATOR_PASSWORD"],
    ]) {
      const url = new URL(process.env.DATABASE_URL!);
      url.username = role!;
      url.password = bootstrap[key!]!;
      const client = new Client({ connectionString: url.toString() });
      await client.connect();
      try {
        const attrs = (
          await client.query(
            "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        expect(Object.values(attrs)).toEqual([false, false, false, false]);
        await expect(
          client.query("SET ROLE migration_owner"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          client.query("CREATE TABLE public.runtime_boundary(id int)"),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.end();
      }
    }
  } finally {
    await catalog.end();
    await removeProvisionedTestUser(
      { userId, workspaceId },
      "c5-catalog-fixture",
    );
  }
});
