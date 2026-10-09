import { Client } from "pg";
const labels = [
  "C5 performance fixture",
  "C5 restore fixture",
  "C5 email lifecycle fixture",
] as const;
/** Committed, large synthetic fixture teardown only. Never called by product
 * services. Mirrors established administrator fixture cleanup, with database,
 * exact identity, label, email and workspace root guards before any deletion. */
export async function removeNamedFinancialFixture(
  owner: { userId: string; workspaceId: string },
  label: (typeof labels)[number],
) {
  if (!labels.includes(label)) throw new Error("Unsupported fixture label.");
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  const c = new Client({
    connectionString: url.toString(),
    application_name: "pmp-named-fixture-cleanup",
  });
  await c.connect();
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  try {
    if (
      (await c.query("SELECT current_database() AS name")).rows[0].name !==
      "personal_management_test"
    )
      throw new Error("Synthetic database required.");
    const root = await c.query(
      'SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND w.id=$2 AND u.name=$3 AND u.email=$4',
      [owner.userId, owner.workspaceId, label, `${owner.userId}@example.test`],
    );
    if (root.rowCount !== 1)
      throw new Error("Synthetic ownership root mismatch.");
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role='replica'");
    const tables = (
      await c.query(
        "SELECT c.table_schema,c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE' WHERE c.column_name='workspace_id' AND c.table_schema=ANY($1)",
        [["core", "finance", "career", "time", "audit", "ops"]],
      )
    ).rows;
    for (const t of tables)
      await c.query(
        `DELETE FROM ${quote(t.table_schema)}.${quote(t.table_name)} WHERE workspace_id=$1`,
        [owner.workspaceId],
      );
    await c.query("DELETE FROM core.workspace WHERE id=$1", [
      owner.workspaceId,
    ]);
    await c.query("DELETE FROM core.user_profile WHERE user_id=$1", [
      owner.userId,
    ]);
    await c.query(
      "DELETE FROM auth.session_assurance WHERE session_id IN(SELECT id FROM auth.session WHERE user_id=$1)",
      [owner.userId],
    );
    await c.query("DELETE FROM auth.session WHERE user_id=$1", [owner.userId]);
    await c.query("DELETE FROM auth.account WHERE user_id=$1", [owner.userId]);
    await c.query("DELETE FROM ops.email_delivery WHERE user_id=$1", [
      owner.userId,
    ]);
    await c.query('DELETE FROM auth."user" WHERE id=$1', [owner.userId]);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    await c.end();
  }
}
