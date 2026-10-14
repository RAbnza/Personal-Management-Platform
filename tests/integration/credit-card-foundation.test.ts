import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { sql } from "drizzle-orm";
import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import {
  CreditCardUnavailableError,
  CreditCardVersionConflictError,
  RESERVED_CARD_ACTION_KINDS,
} from "@/modules/finance/domain/credit-card";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import {
  createCreditCard,
  createCreditCardInTransaction,
  updateCreditCard,
} from "@/modules/finance/services/credit-cards";
import {
  getCreditCardDetail,
  listCreditCards,
} from "@/modules/finance/services/read-credit-cards";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";

type Owner = { userId: string; workspaceId: string };
const label = "V2-A1 card fixture" as const;
const command = (owner: Owner) => ({
  ...owner,
  clientCommandId: randomUUID(),
  name: "BPI Visa",
  issuerName: "BPI",
});

async function fixture(run: (owner: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const { workspaceId } = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId });
    }
    await run(owners[0]!, owners[1]!);
  } finally {
    for (const owner of owners) {
      const exists = await getAuthPool().query(
        'SELECT id FROM auth."user" WHERE id=$1',
        [owner.userId],
      );
      if (exists.rowCount) await removeNamedFinancialFixture(owner, label);
    }
  }
}

async function rejectedSql(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
  code = "23514",
) {
  await client.query("SAVEPOINT rejected_card_write");
  try {
    await expect(client.query(query, values)).rejects.toMatchObject({ code });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT rejected_card_write");
    await client.query("RELEASE SAVEPOINT rejected_card_write");
  }
}

async function scoped(
  owner: Owner,
  run: (client: PoolClient, t: ScopedTransaction) => Promise<void>,
) {
  const client = await getDomainPool().connect();
  try {
    await runScopedTransactionOnClient(client, owner, (t) => run(client, t));
  } finally {
    client.release();
  }
}

afterAll(closeRuntimeDatabasePools);

describe("V2-A1 credit card foundation", () => {
  it("creates dedicated exact-currency identity, completed audit/receipt and no financial movement", async () =>
    fixture(async (owner) => {
      const input = {
        ...command(owner),
        creditLimitMinor: "9007199254740993",
        limitVerifiedDate: "2026-10-11",
      };
      const result = await createCreditCard(input);
      expect(result).toMatchObject({ version: 1, financialRevision: "1" });
      expect(
        (await getCreditCardDetail({ ...owner, cardId: result.cardId })).card,
      ).toMatchObject({
        name: "BPI Visa",
        issuerName: "BPI",
        currency: "PHP",
        creditLimitMinor: "9007199254740993",
        limitVerifiedDate: "2026-10-11",
        postedOutstandingMinor: "0",
        cardCreditMinor: "0",
        archived: false,
      });
      await scoped(owner, async (client, t) => {
        expect(
          (
            await client.query(
              "SELECT kind,currency FROM finance.ledger_account WHERE id=$1",
              [result.liabilityLedgerAccountId],
            )
          ).rows,
        ).toEqual([{ kind: "card_liability", currency: "PHP" }]);
        for (const table of [
          "financial_account",
          "financial_action",
          "action_revision",
          "journal",
          "posting",
          "card_activity",
        ])
          expect(
            (
              await client.query(
                `SELECT id FROM finance.${table} WHERE workspace_id=$1`,
                [owner.workspaceId],
              )
            ).rowCount,
          ).toBe(0);
        expect(
          (
            await client.query(
              "SELECT r.state,r.retain_until,a.subject_kind,a.subject_version,a.after_json FROM audit.private_revision a JOIN core.command_receipt r ON r.workspace_id=a.workspace_id AND r.id=a.command_receipt_id WHERE a.subject_id=$1",
              [result.cardId],
            )
          ).rows[0],
        ).toMatchObject({
          state: "completed",
          retain_until: null,
          subject_kind: "credit_card",
          subject_version: 1,
          after_json: { creditLimitMinor: input.creditLimitMinor },
        });
        const manifest = await readDeletionScope(t, owner);
        expect(
          manifest?.records.find((r) => r.kind === "credit_card")?.count,
        ).toBe("1");
      });
      expect((await listFinancialAccounts(owner)).items).toEqual([]);
    }));

  it("replays normalized intent, ignores request attribution in hashing, and rejects changed commands", async () =>
    fixture(async (owner) => {
      const input = command(owner),
        first = await createCreditCard(input);
      expect(
        await createCreditCard({
          ...input,
          name: " BPI Visa ",
          creditLimitMinor: null,
          requestId: randomUUID(),
        }),
      ).toEqual(first);
      await expect(
        createCreditCard({ ...input, issuerName: "Different issuer" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
      expect((await listCreditCards(owner)).items).toHaveLength(1);
      expect((await listCreditCards(owner)).financialRevision).toBe("1");
    }));

  it("audits metadata/archive/restore with optimistic versions and permanent accounting identity", async () =>
    fixture(async (owner) => {
      const created = await createCreditCard(command(owner));
      const edit = {
        ...command(owner),
        cardId: created.cardId,
        expectedVersion: 1,
        name: "Renamed card",
        creditLimitMinor: "0",
        archived: true,
      };
      const archived = await updateCreditCard(edit);
      expect(archived).toMatchObject({
        version: 2,
        liabilityLedgerAccountId: created.liabilityLedgerAccountId,
      });
      expect(await updateCreditCard(edit)).toEqual(archived);
      expect((await listCreditCards(owner)).items).toEqual([]);
      expect(
        (await listCreditCards({ ...owner, includeArchived: true })).items[0],
      ).toMatchObject({
        name: "Renamed card",
        creditLimitMinor: "0",
        archived: true,
      });
      await expect(
        updateCreditCard({ ...edit, clientCommandId: randomUUID() }),
      ).rejects.toBeInstanceOf(CreditCardVersionConflictError);
      await updateCreditCard({
        ...edit,
        clientCommandId: randomUUID(),
        expectedVersion: 2,
        archived: false,
      });
      expect((await listCreditCards(owner)).items[0]).toMatchObject({
        version: 3,
        archived: false,
      });
      await scoped(owner, async (c) => {
        expect(
          (
            await c.query(
              "SELECT subject_version FROM audit.private_revision WHERE subject_id=$1 ORDER BY subject_version",
              [created.cardId],
            )
          ).rows.map((r) => r.subject_version),
        ).toEqual([1, 2, 3]);
        expect((await c.query("SELECT id FROM finance.posting")).rowCount).toBe(
          0,
        );
      });
    }));

  it("allows duplicate provider/display names with distinct ledgers and stable bounded pagination", async () =>
    fixture(async (owner) => {
      const first = await createCreditCard(command(owner)),
        second = await createCreditCard(command(owner));
      expect(first.liabilityLedgerAccountId).not.toBe(
        second.liabilityLedgerAccountId,
      );
      const page = await listCreditCards({ ...owner, pageSize: 1 });
      expect(page.hasMore).toBe(true);
      const next = await listCreditCards({ ...owner, pageSize: 1, offset: 1 });
      expect(next.hasMore).toBe(false);
      expect(next.items[0]?.cardId).not.toBe(page.items[0]?.cardId);
      expect((await listCreditCards({ ...owner, offset: 2 })).items).toEqual(
        [],
      );
      await expect(
        listCreditCards({ ...owner, pageSize: 101 }),
      ).rejects.toThrow();
    }));

  it("gives missing and foreign cards the same unavailable response and rejects spoofed ownership", async () =>
    fixture(async (owner, other) => {
      const foreign = await createCreditCard(command(other));
      for (const cardId of [foreign.cardId, randomUUID()]) {
        await expect(
          getCreditCardDetail({ ...owner, cardId }),
        ).rejects.toBeInstanceOf(CreditCardUnavailableError);
        await expect(
          updateCreditCard({
            ...command(owner),
            cardId,
            expectedVersion: 1,
            archived: false,
          }),
        ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      }
      expect((await listCreditCards(owner)).items).toEqual([]);
      await expect(
        listCreditCards({
          userId: owner.userId,
          workspaceId: other.workspaceId,
        }),
      ).rejects.toBeInstanceOf(CreditCardUnavailableError);
      await expect(
        createCreditCard({ ...command(owner), workspaceId: other.workspaceId }),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
      const c = await getDomainPool().connect();
      try {
        expect(
          (await c.query("SELECT id FROM finance.credit_card")).rowCount,
        ).toBe(0);
        expect(
          (await c.query("SELECT id FROM finance.card_activity")).rowCount,
        ).toBe(0);
      } finally {
        c.release();
      }
    }));

  it("rejects invalid binding, reuse, currency, attribution and immutable identity through runtime SQL", async () =>
    fixture(async (owner, other) => {
      const own = await createCreditCard(command(owner)),
        foreign = await createCreditCard(command(other));
      await scoped(owner, async (c, t) => {
        const account = await openFinancialAccountInTransaction(t, {
          ...owner,
          clientCommandId: randomUUID(),
          name: "Cash",
          accountType: "cash",
          openingCutoffDate: "2026-10-10",
          openingBalanceMinor: "0",
        });
        const insert =
          "INSERT INTO finance.credit_card(workspace_id,name,issuer_name,liability_ledger_account_id,currency,actor_kind,recorded_by_user_id) VALUES($1,'Test','Issuer',$2,$3,'user',$4)";
        await rejectedSql(c, insert, [
          owner.workspaceId,
          account.ledgerAccountId,
          "PHP",
          owner.userId,
        ]);
        await rejectedSql(c, insert, [
          owner.workspaceId,
          foreign.liabilityLedgerAccountId,
          "PHP",
          owner.userId,
        ]);
        await rejectedSql(c, insert, [
          owner.workspaceId,
          own.liabilityLedgerAccountId,
          "USD",
          owner.userId,
        ]);
        await rejectedSql(c, insert, [
          owner.workspaceId,
          own.liabilityLedgerAccountId,
          "PHP",
          other.userId,
        ]);
        await rejectedSql(
          c,
          insert,
          [
            owner.workspaceId,
            own.liabilityLedgerAccountId,
            "PHP",
            owner.userId,
          ],
          "23505",
        );
        for (const query of [
          "UPDATE finance.credit_card SET liability_ledger_account_id=$2 WHERE id=$1",
          "UPDATE finance.credit_card SET recorded_by_user_id=$2 WHERE id=$1",
          "UPDATE finance.credit_card SET request_id=$2 WHERE id=$1",
          "UPDATE finance.credit_card SET id=$2 WHERE id=$1",
        ])
          await rejectedSql(
            c,
            query,
            [own.cardId, randomUUID()],
            query.includes("SET id=") ? "22023" : "23514",
          );
        await rejectedSql(
          c,
          "UPDATE finance.ledger_account SET kind='cash_asset' WHERE id=$1",
          [own.liabilityLedgerAccountId],
        );
        await rejectedSql(
          c,
          "UPDATE finance.ledger_account SET currency='USD' WHERE id=$1",
          [own.liabilityLedgerAccountId],
        );
        await rejectedSql(
          c,
          "UPDATE finance.credit_card SET credit_limit_minor=-1 WHERE id=$1",
          [own.cardId],
        );
        await rejectedSql(
          c,
          "UPDATE finance.credit_card SET issuer_name=' ' WHERE id=$1",
          [own.cardId],
        );
        await rejectedSql(
          c,
          "DELETE FROM finance.credit_card WHERE id=$1",
          [own.cardId],
          "42501",
        );
      });
    }));

  it("rejects unaudited metadata at commit and rolls back card, ledger, receipt, audit and revision on failure", async () =>
    fixture(async (owner) => {
      const created = await createCreditCard(command(owner));
      await expect(
        withDomainTransaction(owner, (t) =>
          t.db.execute(
            sql`UPDATE finance.credit_card SET name='Unaudited' WHERE id=${created.cardId}::uuid`,
          ),
        ),
      ).rejects.toThrow(/audit/);
      const injected = new Error("injected card failure");
      await expect(
        withDomainTransaction(owner, async (t) => {
          await createCreditCardInTransaction(t, command(owner));
          throw injected;
        }),
      ).rejects.toBe(injected);
      const list = await listCreditCards(owner);
      expect(list.financialRevision).toBe("1");
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.name).toBe("BPI Visa");
      await scoped(owner, async (c) => {
        for (const table of [
          "finance.credit_card",
          "finance.ledger_account",
          "audit.private_revision",
          "core.command_receipt",
        ])
          expect(
            (
              await c.query(
                `SELECT count(*)::text AS n FROM ${table} WHERE workspace_id=$1`,
                [owner.workspaceId],
              )
            ).rows[0].n,
          ).toBe("1");
      });
    }));

  it.each(
    RESERVED_CARD_ACTION_KINDS.filter(
      (kind) => kind === "opening_card" || kind === "card_adjustment",
    ),
  )("blocks reserved %s even in building state", async (kind) =>
    fixture(async (owner) => {
      await scoped(owner, async (c) => {
        await rejectedSql(
          c,
          "INSERT INTO finance.action_revision(workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,actor_kind,recorded_by_user_id) VALUES($1,$2,1,$3,'create',$4,'2026-10-11','PHP','user',$5)",
          [owner.workspaceId, randomUUID(), randomUUID(), kind, owner.userId],
        );
      });
    }),
  );

  it("denies activity without a building parent, arbitrary card postings, grants and tenant-bypass settings", async () =>
    fixture(async (owner) => {
      const created = await createCreditCard(command(owner));
      await scoped(owner, async (c, t) => {
        await rejectedSql(
          c,
          "INSERT INTO finance.card_activity(workspace_id,card_id,action_id,action_revision_id,activity_kind,transaction_date,posting_date,signed_liability_minor) VALUES($1,$2,$3,$4,'purchase','2026-10-11','2026-10-11',-100)",
          [owner.workspaceId, created.cardId, randomUUID(), randomUUID()],
          "23503",
        );
        await rejectedSql(c, "TRUNCATE finance.credit_card", [], "42501");
        await c.query("SELECT set_config('app.skip_immutability','true',true)");
        await rejectedSql(
          c,
          "UPDATE finance.credit_card SET currency='USD' WHERE id=$1",
          [created.cardId],
        );
        // A real building V1 journal reaches the posting gate without weakening parent guards.
        const receipt = randomUUID(),
          action = randomUUID(),
          revision = randomUUID(),
          journal = randomUUID();
        await c.query("SAVEPOINT blocked_posting");
        await c.query(
          "INSERT INTO core.command_receipt(id,workspace_id,client_command_id,command_type,payload_hash) VALUES($1,$2,$3,'finance.expense',$4)",
          [receipt, owner.workspaceId, randomUUID(), Buffer.alloc(32, 7)],
        );
        await c.query(
          "INSERT INTO finance.financial_action(id,workspace_id,original_command_receipt_id,current_revision_id,description,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,$4,'Test',$5,'user')",
          [action, owner.workspaceId, receipt, revision, owner.userId],
        );
        await c.query(
          "INSERT INTO finance.action_revision(id,workspace_id,action_id,revision_no,command_receipt_id,change_kind,action_kind,primary_effective_date,currency,recorded_by_user_id,actor_kind) VALUES($1,$2,$3,1,$4,'create','expense','2026-10-11','PHP',$5,'user')",
          [revision, owner.workspaceId, action, receipt, owner.userId],
        );
        await c.query(
          "INSERT INTO finance.journal(id,workspace_id,action_id,action_revision_id,sequence_no,effective_date,currency,role) VALUES($1,$2,$3,$4,1,'2026-10-11','PHP','economic')",
          [journal, owner.workspaceId, action, revision],
        );
        await rejectedSql(
          c,
          "INSERT INTO finance.posting(workspace_id,action_id,action_revision_id,journal_id,ledger_account_id,currency,line_no,amount_minor) VALUES($1,$2,$3,$4,$5,'PHP',1,-100)",
          [
            owner.workspaceId,
            action,
            revision,
            journal,
            created.liabilityLedgerAccountId,
          ],
        );
        await c.query("ROLLBACK TO SAVEPOINT blocked_posting");
        await c.query("RELEASE SAVEPOINT blocked_posting");
        await t.db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      });
    }));

  it("serializes concurrent retries and competing metadata versions on independent connections", async () =>
    fixture(async (owner) => {
      const input = command(owner);
      const results = await Promise.all([
        createCreditCard(input),
        createCreditCard(input),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect((await listCreditCards(owner)).items).toHaveLength(1);
      const update = {
        ...command(owner),
        cardId: results[0]!.cardId,
        expectedVersion: 1,
        archived: false,
      };
      const raced = await Promise.allSettled([
        updateCreditCard({ ...update, name: "First" }),
        updateCreditCard({
          ...update,
          clientCommandId: randomUUID(),
          name: "Second",
        }),
      ]);
      expect(raced.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (raced.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toBeInstanceOf(CreditCardVersionConflictError);
      expect((await listCreditCards(owner)).financialRevision).toBe("2");
    }));

  it("holds the profile/workspace locks against deletion and raw card roots", async () =>
    fixture(async (owner) => {
      const unboundLedger = randomUUID();
      await scoped(owner, async (c) => {
        await c.query(
          "INSERT INTO finance.ledger_account(id,workspace_id,code,name,kind,currency) VALUES($1::uuid,$2,$1::uuid::text,'Unbound test card','card_liability','PHP')",
          [unboundLedger, owner.workspaceId],
        );
      });
      const holder = await getDomainPool().connect(),
        contender = await getDomainPool().connect();
      let release!: () => void, ready!: () => void;
      const held = new Promise<void>((r) => {
          ready = r;
        }),
        unblock = new Promise<void>((r) => {
          release = r;
        });
      const writing = runScopedTransactionOnClient(holder, owner, async (t) => {
        await createCreditCardInTransaction(t, command(owner));
        ready();
        await unblock;
      });
      try {
        // Failures before the handshake also propagate instead of hanging the test.
        await Promise.race([held, writing]);
        await runScopedTransactionOnClient(contender, owner, async () => {
          await contender.query("SET LOCAL lock_timeout='150ms'");
          await rejectedSql(
            contender,
            "SELECT user_id FROM core.user_profile WHERE user_id=$1 FOR UPDATE",
            [owner.userId],
            "55P03",
          );
          await rejectedSql(
            contender,
            "INSERT INTO finance.credit_card(workspace_id,name,issuer_name,liability_ledger_account_id,currency,recorded_by_user_id,actor_kind) VALUES($1,'Locked test card','Issuer',$2,'PHP',$3,'user')",
            [owner.workspaceId, unboundLedger, owner.userId],
            "55P03",
          );
        });
      } finally {
        release();
        await writing;
        holder.release();
        contender.release();
      }
      expect((await listCreditCards(owner)).items).toHaveLength(1);
    }));

  it("forces RLS/scoped FKs and restricts actual auth, queue, worker and operator roles", async () => {
    const catalog = new Client({
      connectionString: process.env.DATABASE_MIGRATION_URL,
    });
    await catalog.connect();
    try {
      const rows = (
        await catalog.query(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('finance.credit_card'::regclass,'finance.card_activity'::regclass)",
        )
      ).rows;
      expect(rows).toHaveLength(2);
      for (const row of rows)
        expect(row).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true,
        });
      const fks = (
        await catalog.query(
          "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('finance.credit_card'::regclass,'finance.card_activity'::regclass) AND contype='f'",
        )
      ).rows;
      expect(
        fks.find((r) => r.conname === "fk_credit_card_ledger_currency")
          ?.definition,
      ).toContain(
        "FOREIGN KEY (workspace_id, liability_ledger_account_id, currency)",
      );
      expect(
        fks.find((r) => r.conname === "fk_card_activity_revision")?.definition,
      ).toContain("FOREIGN KEY (workspace_id, action_id, action_revision_id)");
      const env = parseEnv(readFileSync(".env.bootstrap", "utf8"));
      for (const [role, key] of [
        ["auth_adapter", "AUTH_ADAPTER_PASSWORD"],
        ["queue_broker", "QUEUE_BROKER_PASSWORD"],
        ["worker_domain", "WORKER_DOMAIN_PASSWORD"],
        ["lifecycle_operator", "LIFECYCLE_OPERATOR_PASSWORD"],
      ]) {
        const url = new URL(process.env.DATABASE_URL!);
        url.username = role!;
        url.password = env[key!]!;
        const c = new Client({ connectionString: url.toString() });
        await c.connect();
        try {
          if (role === "lifecycle_operator" || role === "worker_domain")
            expect(
              (await c.query("SELECT id FROM finance.credit_card")).rowCount,
            ).toBe(0);
          else
            await expect(
              c.query("SELECT id FROM finance.credit_card"),
            ).rejects.toMatchObject({ code: "42501" });
          await expect(
            c.query("INSERT INTO finance.credit_card DEFAULT VALUES"),
          ).rejects.toMatchObject({ code: "42501" });
        } finally {
          await c.end();
        }
      }
    } finally {
      await catalog.end();
    }
  });

  it("blocks deletion-pending card access and purges cards through the approved operator without touching another owner", async () =>
    fixture(async (owner, other) => {
      const card = await createCreditCard(command(owner)),
        preserved = await createCreditCard(command(other));
      let requestId = "";
      await scoped(owner, async (c) => {
        requestId = (await makeDeletionPending(c, owner)).requestId;
      });
      await expect(listCreditCards(owner)).rejects.toBeInstanceOf(
        CreditCardUnavailableError,
      );
      await expect(createCreditCard(command(owner))).rejects.toBeInstanceOf(
        FinancialWriteWorkspaceUnavailableError,
      );
      const env = parseEnv(readFileSync(".env.bootstrap", "utf8"));
      const url = new URL(process.env.DATABASE_URL!);
      url.username = "lifecycle_operator";
      url.password = env.LIFECYCLE_OPERATOR_PASSWORD!;
      const operator = new Client({ connectionString: url.toString() });
      const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
      adminUrl.pathname = "/personal_management_test";
      const admin = new Client({ connectionString: adminUrl.toString() });
      await operator.connect();
      await admin.connect();
      try {
        await expect(purgeDeletionStep(operator, requestId)).rejects.toThrow(
          /grace/,
        );
        // Advance only this synthetic owner's grace period using the test administrator.
        await admin.query("BEGIN");
        await admin.query("SET LOCAL session_replication_role='replica'");
        await admin.query(
          "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
          [requestId, owner.userId],
        );
        await admin.query("COMMIT");
        for (let i = 0; i < 10; i++)
          if (
            (await purgeDeletionStep(operator, requestId)).state === "completed"
          )
            break;
        expect((await purgeDeletionStep(operator, requestId)).state).toBe(
          "completed",
        );
        expect(
          (
            await admin.query(
              "SELECT id FROM finance.credit_card WHERE id=$1",
              [card.cardId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (
            await admin.query(
              "SELECT id FROM finance.ledger_account WHERE id=$1",
              [card.liabilityLedgerAccountId],
            )
          ).rowCount,
        ).toBe(0);
        expect(
          (await getCreditCardDetail({ ...other, cardId: preserved.cardId }))
            .card.name,
        ).toBe("BPI Visa");
      } finally {
        await operator.end();
        await admin.end();
      }
    }));
});
