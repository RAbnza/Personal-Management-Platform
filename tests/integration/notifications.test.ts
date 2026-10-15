import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool, Client } from "pg";
import { sql } from "drizzle-orm";
import { afterAll, expect, it, vi } from "vitest";
import { withDomainTransaction } from "@/platform/db";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  saveNotificationPreferences,
  getNotificationSettings,
  readNotificationPreferences,
} from "@/modules/time/services/notification-preferences";
import { createPersonalEvent } from "@/modules/time/services/create-personal-event";
import { getReminder, mutateReminder } from "@/modules/time/services/reminders";
import {
  scanNotificationScope,
  processNotificationEmail,
  notificationScheduledAt,
  scanNotificationScopeInTransaction,
} from "@/platform/email/notification-delivery";
import { EmailProviderError } from "@/platform/email/sender";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import type { NotificationCommand } from "@/modules/time/domain/notification";
import { mutatePersonalEvent } from "@/modules/time/services/mutate-personal-event";
import { createJobApplication } from "@/modules/career/services/create-job-application";
import { createApplicationEvent } from "@/modules/career/services/create-application-event";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import { recordCardInstallmentPlan } from "@/modules/finance/services/card-installments";
import { recordRecurringCommand } from "@/modules/planning/services/recurring";
import { getDomainPool } from "@/platform/db/pools";
import { fixture as debtFixture } from "./helpers/debt-payment-fixture";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
const bootstrap = parseEnv(readFileSync(".env.bootstrap", "utf8"));
function roleUrl(role: string, password: string) {
  const url = new URL(process.env.AUTH_DATABASE_URL!);
  url.username = role;
  url.password = password;
  return url.toString();
}
const worker = new Pool({
  connectionString: roleUrl("worker_domain", bootstrap.WORKER_DOMAIN_PASSWORD!),
  max: 4,
});
const queue = new Pool({
  connectionString: roleUrl("queue_broker", bootstrap.QUEUE_BROKER_PASSWORD!),
  max: 1,
});
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
adminUrl.pathname = "/personal_management_test";
afterAll(async () => {
  await Promise.all([worker.end(), queue.end()]);
  await closeRuntimeDatabasePools();
  vi.unstubAllEnvs();
});
const preferences = {
  enabled: true,
  timezone: null,
  quietStart: null,
  quietEnd: null,
  includeDueDate: false,
};
async function fixture(
  fn: (
    actor: { userId: string; workspaceId: string },
    eventId: string,
  ) => Promise<void>,
  aged = true,
) {
  const userId = randomUUID();
  await getAuthPool().query(
    "INSERT INTO auth.\"user\"(id,name,email,email_verified) VALUES($1,'V2-G notification fixture',$2,true)",
    [userId, `${userId}@example.test`],
  );
  const { workspaceId } = await provisionPersonalWorkspace({
    userId,
    displayName: "V2-G notification fixture",
  });
  const actor = { userId, workspaceId };
  try {
    await saveNotificationPreferences(actor, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences,
    });
    const today = await withDomainTransaction(
      actor,
      async (tx) =>
        (
          await tx.db.execute<{ date: string }>(
            sql`SELECT ((clock_timestamp() AT TIME ZONE timezone)::date-1)::text date FROM core.workspace`,
          )
        ).rows[0]!.date,
    );
    const event = await createPersonalEvent({
      ...actor,
      clientCommandId: randomUUID(),
      title: "Private financial company note",
      temporalKind: "date",
      // A past 09:00 occurrence is due at every time of day; consent ageing remains explicit.
      eventDate: today,
    });
    if (aged) {
      const c = new Client({ connectionString: adminUrl.toString() });
      await c.connect();
      try {
        expect(
          (await c.query("SELECT current_database() name")).rows[0].name,
        ).toBe("personal_management_test");
        expect(
          (
            await c.query(
              "SELECT 1 FROM auth.\"user\" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND w.id=$2 AND u.name='V2-G notification fixture' AND u.email=$3",
              [userId, workspaceId, `${userId}@example.test`],
            )
          ).rowCount,
        ).toBe(1);
        // Only synthetic consent is aged to simulate a prior opt-in, without sleeps.
        await c.query("BEGIN");
        await c.query("SET LOCAL session_replication_role='replica'");
        await c.query(
          "UPDATE time.notification_preference SET enabled_at=clock_timestamp()-interval '2 days' WHERE workspace_id=$1",
          [workspaceId],
        );
        await c.query("COMMIT");
      } finally {
        await c.end();
      }
    }
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
    await fn(actor, event.eventId);
  } finally {
    if (
      (
        await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
          actor.userId,
        ])
      ).rowCount
    )
      await removeNamedFinancialFixture(actor, "V2-G notification fixture");
  }
}
async function deliveries(actor: { userId: string; workspaceId: string }) {
  return (await getNotificationSettings(actor)).deliveries;
}
async function first(actor: { userId: string; workspaceId: string }) {
  await scanNotificationScope(worker, actor);
  return (await deliveries(actor))[0]!;
}
async function occurrenceControl(
  actor: { userId: string; workspaceId: string },
  eventId: string,
  action: Parameters<typeof mutateReminder>[1]["action"],
) {
  const target = { sourceKind: "personal_event" as const, sourceId: eventId };
  const v = await getReminder(actor, target);
  await mutateReminder(actor, {
    target,
    expectedSnapshot: v.snapshot,
    clientCommandId: randomUUID(),
    action,
  });
}
it("stores explicit reviewed consent with permanent replay, audit, stale conflict, and current verified identity", async () =>
  fixture(async (actor) => {
    const command: NotificationCommand = {
      clientCommandId: randomUUID(),
      expectedVersion: 1,
      preferences: { ...preferences, includeDueDate: true },
    };
    const result = await saveNotificationPreferences(actor, command);
    expect(await saveNotificationPreferences(actor, command)).toEqual(result);
    await expect(
      saveNotificationPreferences(actor, {
        ...command,
        clientCommandId: randomUUID(),
      }),
    ).rejects.toThrow("changed");
    await expect(
      saveNotificationPreferences(actor, {
        ...command,
        preferences: { ...preferences, enabled: false },
      }),
    ).rejects.toThrow();
    await getAuthPool().query(
      'UPDATE auth."user" SET email_verified=false WHERE id=$1',
      [actor.userId],
    );
    await expect(
      saveNotificationPreferences(actor, {
        ...command,
        clientCommandId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toThrow("verified");
    expect(
      await withDomainTransaction(
        actor,
        async (tx) =>
          (
            await tx.db.execute<{ n: string }>(
              sql`SELECT count(*)::text n FROM audit.private_revision WHERE subject_kind='notification_preference'`,
            )
          ).rows[0]!.n,
      ),
    ).toBe("2");
  }));
it("creates ID-only durable jobs exactly once and never changes financial evidence", async () =>
  fixture(async (actor) => {
    const before = await withDomainTransaction(
      actor,
      async (tx) =>
        (
          await tx.db.execute(
            sql`SELECT count(*)::text actions,(SELECT count(*)::text FROM finance.posting) postings FROM finance.financial_action`,
          )
        ).rows,
    );
    await Promise.all([
      scanNotificationScope(worker, actor),
      scanNotificationScope(worker, actor),
    ]);
    const d = await deliveries(actor);
    expect(d).toHaveLength(1);
    expect(d[0]?.source_kind).toBe("personal_event");
    expect(d[0]?.source_id).toMatch(/^[a-f0-9-]{36}$/);
    const jobs = (
      await queue.query(
        "SELECT data FROM pgboss.job WHERE data->>'deliveryId'=$1",
        [d[0]!.id],
      )
    ).rows;
    expect(jobs).toEqual([
      { data: { schemaVersion: 1, deliveryId: d[0]!.id } },
    ]);
    expect(JSON.stringify(jobs)).not.toContain(actor.userId);
    expect(JSON.stringify(jobs)).not.toContain("Private");
    expect(
      await withDomainTransaction(
        actor,
        async (tx) =>
          (
            await tx.db.execute(
              sql`SELECT count(*)::text actions,(SELECT count(*)::text FROM finance.posting) postings FROM finance.financial_action`,
            )
          ).rows,
      ),
    ).toEqual(before);
  }));
it(
  "enqueues queue metadata and jobs on the scoped connection without exhausting a one-connection pool",
  async () =>
    fixture(async (actor) => {
      const single = new Pool({
        connectionString: roleUrl(
          "worker_domain",
          bootstrap.WORKER_DOMAIN_PASSWORD!,
        ),
        max: 1,
        connectionTimeoutMillis: 1000,
      });
      try {
        const result = await scanNotificationScope(single, actor);
        expect(result.scheduled).toBe(1);
        expect(await deliveries(actor)).toHaveLength(1);
        expect((await scanNotificationScope(single, actor)).scheduled).toBe(0);
      } finally {
        await single.end();
      }
    }),
  5000,
);
it("suppresses historical reminders and does not backfill after consent", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    expect(d.status).toBe("suppressed");
    expect(d.last_error_code).toBe("predates_opt_in");
    let sent = 0;
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => {
        sent++;
        return { providerMessageId: randomUUID() };
      },
    );
    expect(sent).toBe(0);
  }, false));
it("serializes duplicate sends, distinguishes acceptance from delivery, and replays without mail", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    let sent = 0;
    const send = async (message: { text: string; to: string }) => {
      sent++;
      expect(message.to).toBe(`${actor.userId}@example.test`);
      expect(message.text).not.toContain("Private financial company note");
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { providerMessageId: randomUUID() };
    };
    await Promise.all([
      processNotificationEmail(
        worker,
        worker,
        { schemaVersion: 1, deliveryId: d.id },
        send,
      ),
      processNotificationEmail(
        worker,
        worker,
        { schemaVersion: 1, deliveryId: d.id },
        send,
      ),
    ]);
    expect(sent).toBe(1);
    const accepted = (await deliveries(actor))[0]!;
    expect(accepted.status).toBe("accepted");
    expect(accepted.accepted_at).not.toBeNull();
    expect(accepted.delivered_at).toBeNull();
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      send,
    );
    expect(sent).toBe(1);
  }));
it("holds ambiguous provider outcomes and crashed committed attempts without blind resend", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    let sent = 0;
    const send = async () => {
      sent++;
      throw new EmailProviderError("uncertain", "synthetic timeout");
    };
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      send,
    );
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      send,
    );
    expect(sent).toBe(1);
    expect((await deliveries(actor))[0]!.status).toBe("uncertain");
    const client = await worker.connect();
    try {
      await runScopedTransactionOnClient(client, actor, async (tx) => {
        await expect(
          tx.db.execute(
            sql`UPDATE time.notification_attempt SET outcome='accepted'`,
          ),
        ).rejects.toThrow();
      });
    } catch {
    } finally {
      client.release();
    }
  }));
it("retries proven rejections at most three times under one logical delivery", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    let sent = 0;
    const send = async () => {
      sent++;
      throw new EmailProviderError("rejected", "synthetic refusal");
    };
    for (let n = 0; n < 5; n++)
      await processNotificationEmail(
        worker,
        worker,
        { schemaVersion: 1, deliveryId: d.id },
        send,
      );
    expect(sent).toBe(3);
    expect(await deliveries(actor)).toHaveLength(1);
    expect((await deliveries(actor))[0]!.status).toBe("failed");
  }));
it("cancels pending work on opt-out, dismissal, source completion and current email verification loss", async () => {
  for (const kind of ["opt-out", "dismiss", "identity", "complete"]) {
    await fixture(async (actor, eventId) => {
      const d = await first(actor);
      if (kind === "opt-out")
        await saveNotificationPreferences(actor, {
          clientCommandId: randomUUID(),
          expectedVersion: 1,
          preferences: { ...preferences, enabled: false },
        });
      if (kind === "dismiss")
        await occurrenceControl(actor, eventId, {
          kind: "dismiss",
          ruleKey: "0:09:00",
        });
      if (kind === "identity")
        await getAuthPool().query(
          'UPDATE auth."user" SET email_verified=false WHERE id=$1',
          [actor.userId],
        );
      if (kind === "complete")
        await mutatePersonalEvent({
          ...actor,
          eventId,
          action: "complete",
          expectedEventVersion: 1,
          clientCommandId: randomUUID(),
        });
      let sent = 0;
      await processNotificationEmail(
        worker,
        worker,
        { schemaVersion: 1, deliveryId: d.id },
        async () => {
          sent++;
          return { providerMessageId: randomUUID() };
        },
      );
      expect(sent).toBe(0);
      expect((await deliveries(actor))[0]!.status).toBe("cancelled");
    });
  }
});
it("reschedules snoozes on the same logical delivery and refuses an early old job", async () =>
  fixture(async (actor, eventId) => {
    const d = await first(actor);
    const until = new Date(Date.now() + 3600000).toISOString();
    await occurrenceControl(actor, eventId, {
      kind: "snooze",
      ruleKey: "0:09:00",
      snoozedUntil: until,
    });
    await scanNotificationScope(worker, actor);
    const changed = await deliveries(actor);
    expect(changed).toHaveLength(1);
    expect(new Date(changed[0]!.scheduled_at).toISOString()).toBe(until);
    let sent = 0;
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => {
        sent++;
        return { providerMessageId: randomUUID() };
      },
    );
    expect(sent).toBe(0);
  }));
it("applies cross-midnight quiet hours, workspace timezone, and DST civil-time conversion", async () =>
  fixture(async (actor) => {
    const c = await worker.connect();
    try {
      await runScopedTransactionOnClient(c, actor, async (tx) => {
        const p = {
          ...(await readNotificationPreferences(tx)),
          timezone: "America/New_York",
          quietStart: "22:00",
          quietEnd: "07:00",
        };
        expect(
          new Date(
            await notificationScheduledAt(tx, "2026-03-08T06:30:00Z", p),
          ).toISOString(),
        ).toBe("2026-03-08T11:00:00.000Z");
        expect(
          new Date(
            await notificationScheduledAt(tx, "2026-11-01T05:30:00Z", p),
          ).toISOString(),
        ).toBe("2026-11-01T12:00:00.000Z");
        expect(
          new Date(
            await notificationScheduledAt(tx, "2026-10-14T14:00:00Z", p),
          ).toISOString(),
        ).toBe("2026-10-14T14:00:00.000Z");
      });
    } finally {
      c.release();
    }
  }));
it("reconciles authenticated provider evidence by stored identity, deduplicates, and preserves recipient privacy", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    const provider = randomUUID();
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => ({ providerMessageId: provider }),
    );
    const hash = createHash("sha256")
      .update(`${actor.userId}@example.test`)
      .digest("hex");
    const id = randomUUID();
    const occurred = new Date().toISOString();
    const record = () =>
      getAuthPool().query(
        "SELECT ops.record_notification_event($1,$2,'email.delivered',$4,NULL,$3) ok",
        [id, provider, hash, occurred],
      );
    await record();
    await record();
    expect((await deliveries(actor))[0]!.status).toBe("delivered");
    expect(
      (
        await getAuthPool().query(
          "SELECT ops.record_notification_event($1,$2,'email.delivered',clock_timestamp(),NULL,$3) ok",
          [randomUUID(), randomUUID(), hash],
        )
      ).rows[0].ok,
    ).toBe(false);
  }));
it("forces owner RLS, rejects forged scope and raw financial/auth/queue-admin writes", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    const c = await worker.connect();
    try {
      await expect(c.query('SELECT * FROM auth."user"')).rejects.toMatchObject({
        code: "42501",
      });
      await expect(
        c.query(
          "INSERT INTO time.notification_provider_event(workspace_id,delivery_id,provider_event_id,event_type,occurred_at) VALUES($1,$2,$3,'email.delivered',clock_timestamp())",
          [actor.workspaceId, d.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        c.query(
          "UPDATE finance.financial_action SET description='forged' WHERE false",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        c.query("CREATE TABLE time.worker_ddl(id int)"),
      ).rejects.toMatchObject({ code: "42501" });
      expect(
        (await c.query("SELECT id FROM time.notification_delivery")).rows,
      ).toHaveLength(0);
      const financialTables = (
        await c.query(
          "SELECT c.oid::regclass::text relation,c.relrowsecurity,c.relforcerowsecurity,has_table_privilege(current_user,c.oid,'SELECT') read,has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') write FROM pg_class c WHERE c.relnamespace='finance'::regnamespace AND c.relkind='r'",
        )
      ).rows;
      for (const table of financialTables) {
        expect(table.write, table.relation).toBe(false);
        if (table.read) {
          expect(
            table.relrowsecurity && table.relforcerowsecurity,
            table.relation,
          ).toBe(true);
          expect(
            (await c.query(`SELECT 1 FROM ${table.relation} LIMIT 1`)).rows,
            table.relation,
          ).toHaveLength(0);
        }
      }
      await runScopedTransactionOnClient(
        c,
        { userId: randomUUID(), workspaceId: actor.workspaceId },
        async (tx) => {
          expect(
            (
              await tx.db.execute(
                sql`SELECT id FROM time.notification_delivery WHERE id=${d.id}::uuid`,
              )
            ).rows,
          ).toHaveLength(0);
        },
      );
    } finally {
      c.release();
    }
  }));
it("records a local Mailpit acceptance without claiming provider delivery or activating Resend", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    expect(process.env.EMAIL_PROVIDER).toBe("mailpit");
    const endpoint = new URL(process.env.MAILPIT_API_URL!);
    expect(["127.0.0.1", "localhost", "pmp-mailpit"]).toContain(
      endpoint.hostname,
    );
    await processNotificationEmail(worker, worker, {
      schemaVersion: 1,
      deliveryId: d.id,
    });
    const status = (await deliveries(actor))[0]!;
    expect(status.status).toBe("accepted");
    expect(status.delivered_at).toBeNull();
  }));
it("keeps later bounce and earlier delivery evidence, and never replays a terminal provider failure", async () =>
  fixture(async (actor) => {
    const d = await first(actor),
      provider = randomUUID(),
      hash = createHash("sha256")
        .update(`${actor.userId}@example.test`)
        .digest("hex");
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => ({ providerMessageId: provider }),
    );
    const record = (kind: string) =>
      getAuthPool().query(
        "SELECT ops.record_notification_event($1,$2,$3,clock_timestamp(),NULL,$4)",
        [randomUUID(), provider, kind, hash],
      );
    await record("email.delivered");
    const delivered = (await deliveries(actor))[0]!;
    await record("email.bounced");
    await record("email.sent");
    const bounced = (await deliveries(actor))[0]!;
    expect(bounced.status).toBe("bounced");
    expect(bounced.delivered_at).toBe(delivered.delivered_at);
    let sent = 0;
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => {
        sent++;
        return { providerMessageId: randomUUID() };
      },
    );
    expect(sent).toBe(0);
  }));
it("rolls back materialized occurrences, deliveries and real pg-boss enqueue together", async () =>
  fixture(async (actor) => {
    let deliveryId: string | undefined;
    const c = await worker.connect();
    try {
      await expect(
        runScopedTransactionOnClient(c, actor, async (tx) => {
          await scanNotificationScopeInTransaction(tx, actor);
          expect(
            (
              await tx.db.execute(
                sql`SELECT id FROM time.notification_delivery`,
              )
            ).rows,
          ).toHaveLength(1);
          deliveryId = (
            await tx.db.execute<{ id: string }>(
              sql`SELECT id FROM time.notification_delivery`,
            )
          ).rows[0]!.id;
          throw new Error("intent rollback");
        }),
      ).rejects.toThrow("intent rollback");
    } finally {
      c.release();
    }
    expect(await deliveries(actor)).toHaveLength(0);
    expect(
      (
        await queue.query(
          "SELECT id FROM pgboss.job WHERE data->>'deliveryId'=$1",
          [deliveryId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      await withDomainTransaction(
        actor,
        async (tx) =>
          (await tx.db.execute(sql`SELECT id FROM time.reminder_occurrence`))
            .rows,
      ),
    ).toHaveLength(0);
    expect((await first(actor)).status).toBe("scheduled");
  }));
it("does not resend for unrelated edits, but retains and cancels superseded date generations", async () =>
  fixture(async (actor, eventId) => {
    const d = await first(actor);
    const view = await getReminder(actor, {
      sourceKind: "personal_event",
      sourceId: eventId,
    });
    const input = {
      ...actor,
      eventId,
      action: "edit" as const,
      title: "Private financial company note",
      temporalKind: "date" as const,
      eventDate: view.dueDate!,
      description: "Unrelated note",
      expectedEventVersion: 1,
      clientCommandId: randomUUID(),
    };
    await mutatePersonalEvent(input);
    await scanNotificationScope(worker, actor);
    expect((await deliveries(actor)).map((r) => r.id)).toEqual([d.id]);
    const later = new Date(view.dueDate! + "T00:00:00Z");
    later.setUTCDate(later.getUTCDate() + 1);
    await mutatePersonalEvent({
      ...input,
      eventDate: later.toISOString().slice(0, 10),
      expectedEventVersion: 2,
      clientCommandId: randomUUID(),
    });
    await scanNotificationScope(worker, actor);
    const ds = await deliveries(actor);
    expect(ds).toHaveLength(2);
    expect(ds.find((r) => r.id === d.id)?.status).toBe("cancelled");
    expect(ds.find((r) => r.id !== d.id)?.status).toBe("scheduled");
  }));
it(
  "materializes eligible Calendar, Career, Debt, statements, installments and recurring sources without financial effects",
  async () =>
    fixture(async (actor) => {
      const application = await createJobApplication({
        ...actor,
        clientCommandId: randomUUID(),
        companyName: "Private company",
        roleTitle: "Private role",
        initialStage: "applied",
        appliedDate: "2026-10-01",
        initialStageEffectiveDate: "2026-10-01",
      });
      await createApplicationEvent({
        ...actor,
        applicationId: application.applicationId,
        clientCommandId: randomUUID(),
        eventKind: "interview",
        title: "Private interview",
        temporalKind: "date",
        eventDate: "2026-10-20",
      });
      const c = await getDomainPool().connect();
      try {
        await runScopedTransactionOnClient(c, actor, () =>
          debtFixture(c, actor),
        );
      } finally {
        c.release();
      }
      const card = await createCreditCard({
        ...actor,
        clientCommandId: randomUUID(),
        name: "Private card",
        issuerName: "Private provider",
      });
      const purchase = await recordCardPurchase({
        ...actor,
        clientCommandId: randomUUID(),
        cardId: card.cardId,
        effectiveDate: "2026-10-01",
        postingDate: "2026-10-02",
        purchaseMinor: "10000",
        splits: [{ amountMinor: "10000", categoryId: null }],
        description: "Private purchase",
      });
      await recordCardStatement({
        ...actor,
        clientCommandId: randomUUID(),
        cardId: card.cardId,
        cycleStart: "2026-10-01",
        cycleEnd: "2026-10-10",
        statementDate: "2026-10-11",
        dueDate: "2026-10-25",
        balanceMinor: "10000",
        minimumDueMinor: "100",
        verificationSource: "Synthetic provider",
        verifiedDate: "2026-10-12",
        entries: [],
      });
      await recordCardInstallmentPlan({
        ...actor,
        clientCommandId: randomUUID(),
        cardId: card.cardId,
        purchaseActionId: purchase.actionId,
        purchaseActionRevisionId: purchase.actionRevisionId,
        principalMinor: "10000",
        installmentCount: 1,
        providerConfirmed: true,
        verificationSource: "Synthetic provider",
        verifiedDate: "2026-10-12",
        installments: [
          {
            dueDate: "2026-10-25",
            principalMinor: "10000",
            interestMinor: "0",
            feeMinor: "0",
            totalMinor: "10000",
          },
        ],
      });
      await recordRecurringCommand({
        ...actor,
        clientCommandId: randomUUID(),
        operation: "definition",
        obligationId: null,
        expectedVersion: null,
        name: "Private bill",
        kind: "bill",
        reason: null,
        rule: {
          effectiveFrom: "2026-10-20",
          frequency: "daily",
          intervalCount: 1,
          weekdays: null,
          dayOfMonth: null,
          shortMonthPolicy: null,
          endsOn: null,
          occurrenceLimit: 1,
          expectedMinor: "1000",
          currency: "PHP",
          categoryId: null,
          defaultAccountId: null,
          timezone: "Asia/Manila",
        },
        window: { from: "2026-10-20", through: "2026-10-20" },
      });
      const counts = () =>
        withDomainTransaction(
          actor,
          async (tx) =>
            (
              await tx.db.execute(
                sql`SELECT (SELECT count(*) FROM finance.financial_action)::text actions,(SELECT count(*) FROM finance.posting)::text postings,(SELECT financial_revision::text FROM core.workspace) revision`,
              )
            ).rows,
        );
      const before = await counts();
      await scanNotificationScope(worker, actor);
      await scanNotificationScope(worker, actor);
      expect(await counts()).toEqual(before);
      const c2 = await worker.connect();
      try {
        await runScopedTransactionOnClient(c2, actor, async (tx) => {
          const rows = (
            await tx.db.execute<{ kind: string }>(
              sql`SELECT DISTINCT CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' WHEN o.debt_obligation_id IS NOT NULL THEN 'debt_installment' WHEN o.card_statement_id IS NOT NULL THEN 'card_statement' WHEN o.card_installment_id IS NOT NULL THEN 'card_installment' ELSE 'expected_occurrence' END kind FROM time.notification_delivery d JOIN time.reminder_occurrence o ON o.id=d.reminder_occurrence_id`,
            )
          ).rows;
          expect(rows.map((r) => r.kind).sort()).toEqual(
            [
              "personal_event",
              "application_event",
              "debt_installment",
              "card_statement",
              "card_installment",
              "expected_occurrence",
            ].sort(),
          );
        });
      } finally {
        c2.release();
      }
    }),
  15000,
);
it("holds a committed attempt across provider I/O and reconciles a lost receipt using signed message tags", async () =>
  fixture(async (actor) => {
    const d = await first(actor);
    let sent = 0;
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => {
        sent++;
        expect((await deliveries(actor))[0]!.status).toBe("attempted");
        throw new Error("synthetic process loss after acceptance");
      },
    );
    expect((await deliveries(actor))[0]!.status).toBe("uncertain");
    await getAuthPool().query(
      "SELECT ops.record_notification_event($1,$2,'email.delivered',clock_timestamp(),$3,$4)",
      [
        randomUUID(),
        randomUUID(),
        d.id,
        createHash("sha256")
          .update(`${actor.userId}@example.test`)
          .digest("hex"),
      ],
    );
    expect((await deliveries(actor))[0]!.status).toBe("delivered");
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: d.id },
      async () => {
        sent++;
        return { providerMessageId: randomUUID() };
      },
    );
    expect(sent).toBe(1);
  }));
it(
  "purges notification evidence under approved lifecycle while retaining another owner",
  async () =>
    fixture(async (actor) => {
      await fixture(async (other) => {
        const otherDelivery = await first(other);
        const d = await first(actor);
        await processNotificationEmail(
          worker,
          worker,
          { schemaVersion: 1, deliveryId: d.id },
          async () => ({ providerMessageId: randomUUID() }),
        );
        const c = await getDomainPool().connect();
        let requestId: string;
        try {
          requestId = (
            await runScopedTransactionOnClient(c, actor, () =>
              makeDeletionPending(c, actor),
            )
          ).requestId;
        } finally {
          c.release();
        }
        const admin = new Client({ connectionString: adminUrl.toString() }),
          op = new Client({
            connectionString: roleUrl(
              "lifecycle_operator",
              bootstrap.LIFECYCLE_OPERATOR_PASSWORD!,
            ),
          });
        await admin.connect();
        await op.connect();
        try {
          await admin.query("BEGIN");
          await admin.query("SET LOCAL session_replication_role='replica'");
          await admin.query(
            "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
            [requestId!, actor.userId],
          );
          await admin.query("COMMIT");
          for (let n = 0; n < 10; n++) {
            if ((await purgeDeletionStep(op, requestId!)).state === "completed")
              break;
          }
          expect(
            (
              await admin.query(
                "SELECT id FROM time.notification_delivery WHERE workspace_id=$1",
                [actor.workspaceId],
              )
            ).rows,
          ).toHaveLength(0);
          expect((await deliveries(other))[0]?.id).toBe(otherDelivery.id);
          await expect(
            processNotificationEmail(
              worker,
              worker,
              { schemaVersion: 1, deliveryId: d.id },
              async () => {
                throw new Error("must not send");
              },
            ),
          ).resolves.toBeUndefined();
        } finally {
          await op.end();
          await admin.end();
        }
      });
    }),
  15000,
);
