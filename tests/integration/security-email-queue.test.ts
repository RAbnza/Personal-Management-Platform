import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { fromDrizzle } from "pg-boss";
import { afterAll, expect, it } from "vitest";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { createRuntimeBoss, SECURITY_EMAIL_QUEUE } from "@/platform/jobs/boss";
import { enqueueSecurityEmail } from "@/platform/email/enqueue";
import { processSecurityEmail } from "@/platform/email/process-delivery";
import { EmailProviderError } from "@/platform/email/sender";
afterAll(closeRuntimeDatabasePools);
it("commits encrypted delivery and ID-only job together; replay and rollback are safe through auth_adapter", async () => {
  const userId = randomUUID(),
    pool = getAuthPool();
  process.env.EMAIL_PAYLOAD_KEY = "12".repeat(32);
  process.env.EMAIL_PAYLOAD_KEY_ID = "test-v1";
  await pool.query(
    "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'Queue fixture',$2,false)",
    [userId, `${userId}@example.test`],
  );
  const command = {
    userId,
    purpose: "verify_email" as const,
    token: "private-bearer-token",
    message: {
      to: `${userId}@example.test`,
      subject: "Verify",
      text: "private-bearer-token",
    },
  };
  try {
    await enqueueSecurityEmail(command);
    await enqueueSecurityEmail(command);
    const rows = (
      await pool.query("SELECT * FROM ops.email_delivery WHERE user_id=$1", [
        userId,
      ])
    ).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("private-bearer-token");
    expect(rows[0].recipient_ciphertext.toString()).not.toContain(
      command.message.to,
    );
    const boss = createRuntimeBoss(pool),
      id = randomUUID();
    await expect(
      drizzle(pool).transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO ops.email_delivery(id,user_id,purpose,logical_key,recipient_ciphertext,payload_ciphertext,key_id,expires_at) VALUES(${id}::uuid,${userId}::uuid,'verify_email',${id},${rows[0].recipient_ciphertext},${rows[0].payload_ciphertext},'test-v1',clock_timestamp()+interval '1 hour')`,
        );
        await boss.send(
          SECURITY_EMAIL_QUEUE,
          { schemaVersion: 1, deliveryId: id },
          { id, db: fromDrizzle(tx, sql) },
        );
        throw new Error("intent rollback");
      }),
    ).rejects.toThrow("intent rollback");
    expect(
      (await pool.query("SELECT id FROM pgboss.job WHERE id=$1", [id])).rows,
    ).toHaveLength(0);
    expect(
      (await pool.query("SELECT id FROM ops.email_delivery WHERE id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    const bootstrap = parseEnv(await readFile(".env.bootstrap", "utf8")),
      url = new URL(process.env.AUTH_DATABASE_URL!);
    url.username = "queue_broker";
    url.password = bootstrap.QUEUE_BROKER_PASSWORD!;
    const worker = new Client({ connectionString: url.toString() });
    await worker.connect();
    try {
      const jobs = (
        await worker.query(
          "SELECT data FROM pgboss.job WHERE data->>'deliveryId'=$1",
          [rows[0].id],
        )
      ).rows;
      expect(jobs).toEqual([
        { data: { schemaVersion: 1, deliveryId: rows[0].id } },
      ]);
      await expect(
        worker.query('SELECT * FROM auth."user"'),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        worker.query("CREATE TABLE pgboss.runtime_ddl(id int)"),
      ).rejects.toMatchObject({ code: "42501" });
      const workerBoss = createRuntimeBoss(worker);
      await workerBoss.start();
      await workerBoss.supervise();
      await workerBoss.stop({ graceful: true });
      let accepted = 0;
      const data = { schemaVersion: 1, deliveryId: rows[0].id };
      const send = async () => {
        accepted++;
        return { providerMessageId: "synthetic-provider-acceptance" };
      };
      await processSecurityEmail(worker, data, 0, send);
      await processSecurityEmail(worker, data, 0, send);
      expect(accepted).toBe(1);
      const terminal = (
        await pool.query(
          "SELECT status,recipient_ciphertext,payload_ciphertext FROM ops.email_delivery WHERE id=$1",
          [rows[0].id],
        )
      ).rows[0];
      expect(terminal).toEqual({
        status: "accepted",
        recipient_ciphertext: Buffer.alloc(0),
        payload_ciphertext: null,
      });
      await enqueueSecurityEmail({
        ...command,
        token: "another-private-token",
      });
      const uncertain = (
        await pool.query(
          "SELECT id FROM ops.email_delivery WHERE user_id=$1 AND status='queued'",
          [userId],
        )
      ).rows[0];
      let attempts = 0;
      const unknown = async () => {
        attempts++;
        throw new EmailProviderError("uncertain", "synthetic timeout");
      };
      await processSecurityEmail(
        worker,
        { schemaVersion: 1, deliveryId: uncertain.id },
        0,
        unknown,
      );
      await processSecurityEmail(
        worker,
        { schemaVersion: 1, deliveryId: uncertain.id },
        1,
        unknown,
      );
      expect(attempts).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT status FROM ops.email_delivery WHERE id=$1",
            [uncertain.id],
          )
        ).rows[0].status,
      ).toBe("uncertain");
      await pool.query(
        "UPDATE ops.email_delivery SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",
        [uncertain.id],
      );
      await processSecurityEmail(
        worker,
        { schemaVersion: 1, deliveryId: uncertain.id },
        2,
        unknown,
      );
      expect(
        (
          await pool.query(
            "SELECT status,payload_ciphertext FROM ops.email_delivery WHERE id=$1",
            [uncertain.id],
          )
        ).rows[0],
      ).toEqual({ status: "expired", payload_ciphertext: null });
      await worker.query(
        "DELETE FROM pgboss.job WHERE data->>'deliveryId'=ANY($1::text[])",
        [[rows[0].id, uncertain.id]],
      );
    } finally {
      await worker.end();
    }
  } finally {
    await pool.query("DELETE FROM ops.email_delivery WHERE user_id=$1", [
      userId,
    ]);
    await pool.query('DELETE FROM auth."user" WHERE id=$1', [userId]);
  }
});
