import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashPassword } from "better-auth/crypto";
import { test as base } from "@playwright/test";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
export type BrowserOwner = {
  userId: string;
  workspaceId: string;
  email: string;
  password: string;
};
export async function createBrowserOwner(): Promise<BrowserOwner> {
  const userId = randomUUID(),
    email = `dashboard-browser-${userId}@example.test`,
    password = `Test-only-${randomUUID()}!`;
  await getAuthPool().query(
    `INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,'Dashboard browser fixture',$2,true)`,
    [userId, email],
  );
  try {
    await getAuthPool().query(
      `INSERT INTO auth.account (id,account_id,provider_id,user_id,password,updated_at) VALUES ($1::uuid,$2::uuid::text,'credential',$2::uuid,$3::text,clock_timestamp())`,
      [randomUUID(), userId, await hashPassword(password)],
    );
    const workspace = await provisionPersonalWorkspace({
      userId,
      displayName: "Dashboard browser fixture",
    });
    return { userId, workspaceId: workspace.workspaceId, email, password };
  } catch (error) {
    await getAuthPool().query(
      'DELETE FROM auth."user" WHERE id=$1 AND email=$2',
      [userId, email],
    );
    throw error;
  }
}

/** Administrator-only cleanup of this named synthetic owner's committed
 * browser fixtures. Mirrors committed-fixture integration cleanup; production
 * evidence deletion remains forbidden. Scope and database are checked first. */
export async function removeBrowserOwner(owner: BrowserOwner) {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  if (
    !owner.email.startsWith("dashboard-browser-") ||
    !owner.email.endsWith("@example.test")
  )
    throw new Error("Refusing nonfixture cleanup");
  const c = new Client({
    connectionString: url.toString(),
    application_name: "pmp-dashboard-browser-cleanup",
  });
  await c.connect();
  try {
    await c.query("BEGIN");
    const root = await c.query(
      `SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND u.email=$2 AND w.id=$3`,
      [owner.userId, owner.email, owner.workspaceId],
    );
    if (root.rowCount !== 1) throw new Error("Fixture ownership root mismatch");
    await c.query("SET LOCAL session_replication_role='replica'");
    const tables = await c.query<{ table_schema: string; table_name: string }>(
      `SELECT c.table_schema,c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE' WHERE c.column_name='workspace_id' AND c.table_schema IN ('core','finance','career','time','audit')`,
    );
    for (const row of tables.rows) {
      if (
        !/^[a-z_]+$/.test(row.table_schema) ||
        !/^[a-z_]+$/.test(row.table_name)
      )
        throw new Error("Unexpected table name");
      await c.query(
        `DELETE FROM "${row.table_schema}"."${row.table_name}" WHERE workspace_id=$1`,
        [owner.workspaceId],
      );
    }
    await c.query(
      "DELETE FROM core.workspace WHERE id=$1 AND owner_user_id=$2",
      [owner.workspaceId, owner.userId],
    );
    await c.query("DELETE FROM core.user_profile WHERE user_id=$1", [
      owner.userId,
    ]);
    await c.query("DELETE FROM auth.session WHERE user_id=$1", [owner.userId]);
    await c.query("DELETE FROM auth.account WHERE user_id=$1", [owner.userId]);
    await c.query('DELETE FROM auth."user" WHERE id=$1 AND email=$2', [
      owner.userId,
      owner.email,
    ]);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    await c.end();
  }
}

export const test = base.extend<{ owner: BrowserOwner }>({
  owner: async ({ baseURL, context }, provide) => {
    if (baseURL !== "http://localhost:3100")
      throw new Error("Browser fixtures require the isolated test server");
    const owner = await createBrowserOwner();
    try {
      await provide(owner);
    } finally {
      await context.close();
      await removeBrowserOwner(owner);
      await closeRuntimeDatabasePools();
    }
  },
});
