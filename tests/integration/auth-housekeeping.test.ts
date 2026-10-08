import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { purgeExpiredAuthMetadata } from "@/platform/auth/housekeeping";

describe("bounded auth metadata maintenance", () => {
  it("removes expired and absolute-lifetime sessions, proofs and tokens while retaining current credentials", async () => {
    const client = new Client({
      connectionString: process.env.AUTH_DATABASE_URL,
    });
    const userId = randomUUID();
    const expired = randomUUID(),
      absolute = randomUUID(),
      active = randomUUID(),
      recent = randomUUID();
    const expiredToken = randomUUID(),
      liveToken = randomUUID();
    const expiredCounter = randomUUID(),
      activeCounter = randomUUID();
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query(
        "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'Housekeeping fixture',$2,true)",
        [userId, `${userId}@example.test`],
      );
      for (const [id, creation, expiry] of [
        [expired, "1 day", "-1 second"],
        [absolute, "31 days", "1 day"],
        [active, "1 day", "1 day"],
        [recent, "0 seconds", "7 days"],
      ]) {
        await client.query(
          "INSERT INTO auth.session(id,user_id,token,created_at,updated_at,expires_at) VALUES($1,$2,$3,clock_timestamp()-$4::interval,clock_timestamp(),clock_timestamp()+$5::interval)",
          [id, userId, randomUUID(), creation, expiry],
        );
      }
      await client.query(
        "INSERT INTO auth.session_assurance(session_id,method,verified_at) VALUES($1,'password',clock_timestamp()-interval '6 minutes'),($2,'password',clock_timestamp())",
        [active, recent],
      );
      await client.query(
        "INSERT INTO auth.verification(id,identifier,value,expires_at) VALUES($1,$2,$3,clock_timestamp()-interval '1 second'),($4,$5,$3,clock_timestamp()+interval '1 day')",
        [expiredToken, randomUUID(), userId, liveToken, randomUUID()],
      );
      await purgeExpiredAuthMetadata(client);
      expect(
        (
          await client.query(
            "SELECT id FROM auth.session WHERE user_id=$1 ORDER BY id",
            [userId],
          )
        ).rows.map((r) => r.id),
      ).toEqual([active, recent].sort());
      expect(
        (
          await client.query(
            "SELECT session_id FROM auth.session_assurance WHERE session_id=ANY($1::uuid[])",
            [[active, recent]],
          )
        ).rows,
      ).toEqual([{ session_id: recent }]);
      expect(
        (
          await client.query(
            "SELECT id FROM auth.verification WHERE id=ANY($1::uuid[])",
            [[expiredToken, liveToken]],
          )
        ).rows,
      ).toEqual([{ id: liveToken }]);
      await client.query(
        "INSERT INTO auth.rate_limit(id,key,count,last_request) VALUES($1,$2,1,floor(extract(epoch FROM clock_timestamp()-interval '31 days')*1000)::bigint),($3,$4,1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)",
        [expiredCounter, randomUUID(), activeCounter, randomUUID()],
      );
      await purgeExpiredAuthMetadata(client);
      expect(
        (
          await client.query(
            "SELECT id FROM auth.rate_limit WHERE id=ANY($1::uuid[])",
            [[expiredCounter, activeCounter]],
          )
        ).rows,
      ).toEqual([{ id: activeCounter }]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("rejects an ordinary runtime connection", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await expect(purgeExpiredAuthMetadata(client)).rejects.toThrow(
        "auth_adapter",
      );
    } finally {
      await client.end();
    }
  });
  it("preserves a counter renewed while cleanup waits on its row lock", async () => {
    const cleanup = new Client({
      connectionString: process.env.AUTH_DATABASE_URL,
    });
    const renewal = new Client({
      connectionString: process.env.AUTH_DATABASE_URL,
    });
    const id = randomUUID();
    let pending: Promise<unknown> | undefined;
    let renewalActive = false;
    await cleanup.connect();
    await renewal.connect();
    try {
      await cleanup.query(
        "INSERT INTO auth.rate_limit(id,key,count,last_request) VALUES($1,$2,1,floor(extract(epoch FROM clock_timestamp()-interval '31 days')*1000)::bigint)",
        [id, randomUUID()],
      );
      const pid = (await cleanup.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid;
      await renewal.query("BEGIN");
      renewalActive = true;
      await renewal.query(
        "UPDATE auth.rate_limit SET count=2,last_request=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE id=$1",
        [id],
      );
      pending = purgeExpiredAuthMetadata(cleanup);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await renewal.query("SELECT pg_stat_clear_snapshot()");
        if (
          (
            await renewal.query(
              "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
              [pid],
            )
          ).rows[0]?.wait_event_type === "Lock"
        ) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await renewal.query("COMMIT");
      renewalActive = false;
      await pending;
      expect(
        (
          await cleanup.query("SELECT count FROM auth.rate_limit WHERE id=$1", [
            id,
          ])
        ).rows,
      ).toEqual([{ count: 2 }]);
    } finally {
      if (renewalActive) await renewal.query("ROLLBACK");
      await pending?.catch(() => undefined);
      await cleanup.query("DELETE FROM auth.rate_limit WHERE id=$1", [id]);
      await cleanup.end();
      await renewal.end();
    }
  });
});
