import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { expect, it } from "vitest";
it("ordinary runtime roles cannot authorize an offline restore deletion", async () => {
  const bootstrap = parseEnv(await readFile(".env.bootstrap", "utf8"));
  for (const [role, key] of [
    ["app_domain", "APP_DOMAIN_PASSWORD"],
    ["auth_adapter", "AUTH_ADAPTER_PASSWORD"],
    ["queue_broker", "QUEUE_BROKER_PASSWORD"],
    ["lifecycle_operator", "LIFECYCLE_OPERATOR_PASSWORD"],
  ]) {
    const url = new URL(process.env.DATABASE_URL!);
    url.username = role!;
    url.password = bootstrap[key!]!;
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    try {
      await expect(
        client.query(
          "INSERT INTO ops.restore_deletion_authorization(request_id,target_user_id,target_workspace_id,register_hash) VALUES($1,$2,$3,$4)",
          [randomUUID(), randomUUID(), randomUUID(), Buffer.alloc(32)],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.end();
    }
  }
});
