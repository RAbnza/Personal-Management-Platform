import { saveNotificationPreferences } from "@/modules/time/services/notification-preferences";
import {
  scanNotificationScope,
  processNotificationEmail,
} from "@/platform/email/notification-delivery";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardPurchase } from "@/modules/finance/services/record-expense";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import { recordCardAllocation } from "@/modules/finance/services/card-allocations";
import { recordCardInstallmentPlan } from "@/modules/finance/services/card-installments";
import { createJobApplication } from "@/modules/career/services/create-job-application";
import { createPersonalEvent } from "@/modules/time/services/create-personal-event";
import { randomUUID } from "node:crypto";
import { graphRegistry } from "@/modules/portability/domain/graph-registry";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool, Client } from "pg";
import { afterAll, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { getDomainPool } from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { purgeDeletionStep } from "@/platform/lifecycle/purge";
import { withDomainTransaction } from "@/platform/db";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import {
  reserveAttachment,
  uploadAttachment,
  listAttachments,
  downloadAttachment,
  mutateAttachment,
  unlinkedAttachments,
} from "@/modules/files/services/attachments";
import { processAttachment } from "@/platform/files/process-attachment";
import { previewDigest } from "@/modules/portability/domain/csv-preview";
import { sha256 } from "@/modules/files/domain/supporting-file";
import {
  stageImport,
  controlImport,
  importStatus,
} from "@/modules/portability/services/imports";
import {
  exportWorkspace,
  previewWorkspaceRestore,
  restoreWorkspace,
  prepareWorkspaceExport,
  downloadWorkspaceExport,
  downloadWorkspaceRecovery,
  bundleTotals,
} from "@/modules/portability/services/workspace-bundles";
import { recordExpense } from "@/modules/finance/services/record-expense";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
const b = parseEnv(readFileSync(".env.bootstrap", "utf8")),
  url = new URL(process.env.DATABASE_URL!);
url.username = "worker_domain";
url.password = b.WORKER_DOMAIN_PASSWORD!;
const worker = new Pool({ connectionString: url.toString(), max: 3 });
afterAll(async () => {
  vi.unstubAllEnvs();
  await worker.end();
  await closeRuntimeDatabasePools();
});
async function fixture(
  fn: (
    a: { userId: string; workspaceId: string },
    account: { accountId: string; openingActionId: string | null },
  ) => Promise<void>,
) {
  const userId = randomUUID();
  await getAuthPool().query(
    'INSERT INTO auth."user"(id,name,email,email_verified)VALUES($1,$2,$3,true)',
    [userId, "V2-H portability fixture", `${userId}@example.test`],
  );
  const { workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: "V2-H portability fixture",
    }),
    a = { userId, workspaceId };
  try {
    const account = await openFinancialAccount({
      ...a,
      clientCommandId: randomUUID(),
      name: "Evidence cash",
      accountType: "cash",
      openingCutoffDate: "2026-01-01",
      openingBalanceMinor: "100000",
    });
    await fn(a, account);
  } finally {
    if (
      (
        await getAuthPool().query('SELECT id FROM auth."user" WHERE id=$1', [
          a.userId,
        ])
      ).rows.length
    )
      await removeNamedFinancialFixture(a, "V2-H portability fixture");
  }
}
const body = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
function adapters() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    store: {
      async putOnce(k: string, v: Buffer) {
        if (objects.has(k)) throw Error("Conflict");
        objects.set(k, Buffer.from(v));
      },
      async read(k: string) {
        const v = objects.get(k);
        if (!v) throw Error("Missing");
        return Buffer.from(v);
      },
      async delete(k: string) {
        objects.delete(k);
      },
    },
    scanner: {
      async scan(v: Buffer) {
        return {
          result: "passed" as const,
          engineVersion: "ClamAV 1.4.3",
          signaturesUpdatedAt: new Date().toISOString(),
          checksumSha256: sha256(v),
        };
      },
    },
  };
}
it("keeps uploaded bytes unavailable until scanning and preserves financial facts", async () =>
  fixture(async (a, account) => {
    const { store, scanner } = adapters(),
      c = {
        clientCommandId: randomUUID(),
        sourceKind: "financial_action" as const,
        sourceId: account.openingActionId!,
        originalFilename: "receipt.pdf",
        declaredMime: "application/pdf" as const,
        declaredBytes: body.length,
      };
    const r = (await reserveAttachment(a, c, false)) as {
      attachmentId: string;
    };
    expect(await reserveAttachment(a, c, false)).toEqual(r);
    await expect(downloadAttachment(a, r.attachmentId, store)).rejects.toThrow(
      "FILE_NOT_AVAILABLE",
    );
    const uploadId = randomUUID();
    await uploadAttachment(a, r.attachmentId, uploadId, body, store);
    await expect(downloadAttachment(a, r.attachmentId, store)).rejects.toThrow(
      "FILE_NOT_AVAILABLE",
    );
    await processAttachment(
      worker,
      { schemaVersion: 1, attachmentId: r.attachmentId },
      store,
      scanner,
    );
    expect((await downloadAttachment(a, r.attachmentId, store)).bytes).toEqual(
      body,
    );
    expect(
      (
        await listAttachments(a, "financial_action", account.openingActionId!)
      )[0],
    ).toMatchObject({ status: "available" });
    const financial = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT financial_revision::text revision,(SELECT count(*)::int FROM finance.financial_action) actions FROM core.workspace`,
          )
        ).rows[0],
    );
    expect(financial).toEqual({ revision: "1", actions: 1 });
    const row = (
      await listAttachments(a, "financial_action", account.openingActionId!)
    )[0] as { version: number };
    const unrelated = await recordExpense({
      ...a,
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      effectiveDate: "2026-01-02",
      purchaseMinor: "100",
      splits: [{ amountMinor: "100", categoryId: null, memo: null }],
      description: "Another owned record",
    });
    await expect(
      mutateAttachment(a, {
        clientCommandId: randomUUID(),
        attachmentId: r.attachmentId,
        sourceKind: "financial_action",
        sourceId: unrelated.actionId,
        operation: "delete",
        expectedVersion: row.version,
      }),
    ).rejects.toThrow("FILE_SOURCE_UNAVAILABLE");
    await mutateAttachment(a, {
      clientCommandId: randomUUID(),
      attachmentId: r.attachmentId,
      sourceKind: "financial_action",
      sourceId: account.openingActionId!,
      operation: "delete",
      expectedVersion: row.version,
    });
    await processAttachment(
      worker,
      { schemaVersion: 1, attachmentId: r.attachmentId },
      store,
      scanner,
    );
    expect(
      (
        await listAttachments(a, "financial_action", account.openingActionId!)
      )[0],
    ).toMatchObject({ status: "deleted" });
  }));
it("rejects forged scan availability and foreign source IDs", async () =>
  fixture(async (a, account) =>
    fixture(async (other, foreign) => {
      await expect(
        reserveAttachment(
          a,
          {
            clientCommandId: randomUUID(),
            sourceKind: "financial_action",
            sourceId: foreign.openingActionId!,
            originalFilename: "private.pdf",
            declaredMime: "application/pdf",
            declaredBytes: body.length,
          },
          false,
        ),
      ).rejects.toThrow("FILE_SOURCE_UNAVAILABLE");
      const r = (await reserveAttachment(
        a,
        {
          clientCommandId: randomUUID(),
          sourceKind: "financial_action",
          sourceId: account.openingActionId!,
          originalFilename: "private.pdf",
          declaredMime: "application/pdf",
          declaredBytes: body.length,
        },
        false,
      )) as { attachmentId: string };
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE files.private_attachment SET status='available',version=version+1 WHERE id=${r.attachmentId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      expect(
        await listAttachments(
          other,
          "financial_action",
          foreign.openingActionId!,
        ),
      ).toEqual([]);
      await expect(
        downloadAttachment(other, r.attachmentId, adapters().store),
      ).rejects.toThrow("FILE_UNAVAILABLE");
    }),
  ));
const csv =
  "date,kind,amount_minor,classification,description,reference\n2026-02-01,expense,5000,expense,Imported receipt,row-1\n2026-02-02,income,2000,earned,Imported salary,row-2\n";
function assumptions(accountId: string) {
  return {
    sourceFormat: "pmp-cash-activity" as const,
    formatVersion: 1 as const,
    mapping: {
      date: "date",
      kind: "kind",
      amountMinor: "amount_minor",
      classification: "classification",
      description: "description",
      reference: "reference",
    },
    dateInterpretation: "YYYY-MM-DD" as const,
    currency: "PHP" as const,
    targetAccountId: accountId,
    cutoffStrategy: "after_opening" as const,
    cutoffDate: "2026-01-01",
    earlierOpeningMinor: null,
    earlierOpeningDate: null,
  };
}
it("persists exact reviewed imports and never duplicates a completed row or command", async () =>
  fixture(async (a, account) => {
    const c = {
        clientCommandId: randomUUID(),
        csv,
        assumptions: assumptions(account.accountId),
      },
      staged = (await stageImport(a, c)) as {
        batchId: string;
        previewHash: string;
      };
    expect(await stageImport(a, c)).toEqual(staged);
    const status = (await importStatus(a, staged.batchId)) as {
      batch: { preview_json: { rows: { rowNo: number }[] } };
    };
    const confirm = {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "confirm" as const,
      previewHash: staged.previewHash,
      decisions: status.batch.preview_json.rows.map((r) => ({
        rowNo: r.rowNo,
        choice: "import" as const,
        acknowledgeDuplicates: true,
      })),
      acknowledgeNegativeBalance: false,
    };
    await controlImport(a, confirm);
    const process = {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "process" as const,
    };
    await controlImport(a, process);
    expect(await controlImport(a, process)).toMatchObject({
      batchId: staged.batchId,
    });
    const final = (await importStatus(a, staged.batchId)) as {
      batch: { state: string };
      rows: { state: string }[];
    };
    expect(final.batch.state).toBe("completed");
    expect(final.rows.map((r) => r.state)).toEqual(["posted", "posted"]);
    const actual = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT sum(amount_minor)::text cash FROM finance.posting p JOIN finance.ledger_account l ON l.id=p.ledger_account_id AND l.workspace_id=p.workspace_id WHERE l.kind='cash_asset'`,
          )
        ).rows[0],
    );
    expect(actual).toEqual({ cash: "97000" });
  }));
it("rebases recognized opening history atomically without changing covered cash twice", async () =>
  fixture(async (a, account) => {
    const data =
      "date,kind,amount_minor,classification,description,reference\n2025-12-01,income,20000,earned,Historical salary,history-1\n";
    const staged = (await stageImport(a, {
      clientCommandId: randomUUID(),
      csv: data,
      assumptions: {
        ...assumptions(account.accountId),
        cutoffStrategy: "rebase_history",
        earlierOpeningDate: "2025-01-01",
        earlierOpeningMinor: "80000",
      },
    })) as { batchId: string; previewHash: string };
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "confirm",
      previewHash: staged.previewHash,
      decisions: [{ rowNo: 1, choice: "import", acknowledgeDuplicates: true }],
      acknowledgeNegativeBalance: true,
    });
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "process",
    });
    const result = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT f.opening_cutoff_date::text cutoff,(SELECT sum(p.amount_minor)::text FROM finance.posting p WHERE p.ledger_account_id=f.ledger_account_id) cash,(SELECT count(*)::int FROM finance.action_revision r WHERE r.action_id=f.opening_action_id) revisions FROM finance.financial_account f`,
          )
        ).rows[0],
    );
    expect(result).toEqual({
      cutoff: "2025-01-01",
      cash: "100000",
      revisions: 2,
    });
  }));
it("exports the private graph and restores it atomically with a retained recovery snapshot and retired command replay", async () =>
  fixture(async (a, account) => {
    const bundle = await exportWorkspace(a);
    const purchase = {
      ...a,
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      effectiveDate: "2026-02-01",
      purchaseMinor: "5000",
      splits: [{ amountMinor: "5000", categoryId: null, memo: null }],
      description: "Later receipt",
    };
    const old = await recordExpense(purchase);
    const p = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle,
    })) as {
      runId: string;
      previewHash: string;
      preview: { blockers: string[] };
    };
    expect(p.preview.blockers).toEqual([]);
    const c = {
      clientCommandId: randomUUID(),
      runId: p.runId,
      previewHash: p.previewHash,
      confirmation: "replace-private-workspace",
    };
    const restored = await restoreWorkspace(a, c);
    expect(restored).toMatchObject({ restored: true, recoveryRetained: true });
    expect(await restoreWorkspace(a, c)).toEqual(restored);
    const recovery = await downloadWorkspaceRecovery(a, p.runId);
    expect(
      recovery.entities.find((e) => e.kind === "finance.financial_action")!
        .records,
    ).toHaveLength(2);
    const back = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle: recovery,
    })) as { runId: string; previewHash: string };
    expect(
      await restoreWorkspace(a, {
        runId: back.runId,
        previewHash: back.previewHash,
        clientCommandId: randomUUID(),
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: true });
    const again = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle,
    })) as { runId: string; previewHash: string };
    expect(
      await restoreWorkspace(a, {
        runId: again.runId,
        previewHash: again.previewHash,
        clientCommandId: randomUUID(),
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: true });
    const facts = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT (SELECT sum(amount_minor)::text FROM finance.posting p JOIN finance.ledger_account l ON l.id=p.ledger_account_id WHERE l.kind='cash_asset') cash,(SELECT count(*)::int FROM finance.financial_action) actions,(SELECT recovery_json IS NOT NULL FROM ops.restore_run WHERE id=${p.runId}::uuid) recovered`,
          )
        ).rows[0],
    );
    expect(facts).toEqual({ cash: "100000", actions: 1, recovered: true });
    expect(await recordExpense(purchase)).toEqual(old);
  }));
it("stores an audited private expiring bundle and reauthorizes downloads", async () =>
  fixture(async (a) =>
    fixture(async (other) => {
      const id = randomUUID(),
        r = (await prepareWorkspaceExport(a, id)) as { exportRunId: string };
      expect(await prepareWorkspaceExport(a, id)).toEqual(r);
      const bundle = await downloadWorkspaceExport(a, r.exportRunId);
      expect(bundle.manifest.sourceWorkspaceId).toBe(a.workspaceId);
      await expect(
        downloadWorkspaceExport(other, r.exportRunId),
      ).rejects.toThrow("PORTABLE_EXPORT_EXPIRED");
      await syntheticAdmin(async (c) => {
        await c.query("BEGIN");
        await c.query("SET LOCAL session_replication_role='replica'");
        await c.query(
          "INSERT INTO core.command_receipt(workspace_id,client_command_id,command_type,payload_hash,state,result_json,completed_at) SELECT $1,gen_random_uuid(),'test.capacity',decode(repeat('0',64),'hex'),'completed','{}'::jsonb,clock_timestamp() FROM generate_series(1,10001)",
          [a.workspaceId],
        );
        await c.query("COMMIT");
      });
      await expect(exportWorkspace(a)).rejects.toThrow("PORTABLE_ROW_LIMIT");
      expect(await prepareWorkspaceExport(a, id)).toEqual(r);
    }),
  ));
it.each([
  { old: "100000", early: "0", kind: "income", amount: "100000" },
  { old: "0", early: "10000", kind: "expense", amount: "10000" },
  { old: "0", early: "0", kind: "income", amount: "10000" },
])(
  "supports zero baseline transitions $old → $early without invented zero journals",
  async (scenario) =>
    fixture(async (a, account) => {
      let target = account.accountId;
      if (scenario.old === "0")
        target = (
          await openFinancialAccount({
            ...a,
            clientCommandId: randomUUID(),
            name: "Zero cash",
            accountType: "cash",
            openingCutoffDate: "2026-01-01",
            openingBalanceMinor: "0",
          })
        ).accountId;
      const data =
        `date,kind,amount_minor,classification,description,reference\n2025-12-01,${scenario.kind},${scenario.amount},${scenario.kind === "income" ? "earned" : "expense"},Historical evidence,z1\n` +
        (scenario.early === "0" && scenario.old === "0"
          ? "2025-12-02,expense,10000,expense,Historical cost,z2\n"
          : "");
      const staged = (await stageImport(a, {
        clientCommandId: randomUUID(),
        csv: data,
        assumptions: {
          ...assumptions(target),
          cutoffStrategy: "rebase_history",
          earlierOpeningDate: "2025-01-01",
          earlierOpeningMinor: scenario.early,
        },
      })) as { batchId: string; previewHash: string };
      const status = (await importStatus(a, staged.batchId)) as {
        batch: { preview_json: { rows: { rowNo: number }[] } };
      };
      await controlImport(a, {
        clientCommandId: randomUUID(),
        batchId: staged.batchId,
        operation: "confirm",
        previewHash: staged.previewHash,
        decisions: status.batch.preview_json.rows.map((r) => ({
          rowNo: r.rowNo,
          choice: "import",
          acknowledgeDuplicates: true,
        })),
        acknowledgeNegativeBalance: true,
      });
      await controlImport(a, {
        clientCommandId: randomUUID(),
        batchId: staged.batchId,
        operation: "process",
      });
      const actual = await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT f.opening_cutoff_date::text cutoff,COALESCE((SELECT sum(p.amount_minor)::text FROM finance.posting p WHERE p.ledger_account_id=f.ledger_account_id),'0') cash FROM finance.financial_account f WHERE id=${target}::uuid`,
            )
          ).rows[0],
      );
      expect(actual).toEqual({ cutoff: "2025-01-01", cash: scenario.old });
    }),
);

it("remaps a foreign portable graph while preserving source ownership and exact cash", async () =>
  fixture(async (source, account) => {
    await recordExpense({
      ...source,
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      purchaseMinor: "1000",
      splits: [{ amountMinor: "1000", categoryId: null, memo: null }],
      effectiveDate: "2026-01-02",
      description: account.accountId,
    });
    const bundle = await exportWorkspace(source);
    // Another owner's unresolved bytes must not block this owner's replacement.
    await reserveAttachment(
      source,
      {
        clientCommandId: randomUUID(),
        sourceKind: "financial_action",
        sourceId: account.openingActionId!,
        originalFilename: "foreign-private.pdf",
        declaredMime: "application/pdf",
        declaredBytes: body.length,
      },
      false,
    );
    await fixture(async (target) => {
      const p = (await previewWorkspaceRestore(target, {
        clientCommandId: randomUUID(),
        bundle,
      })) as {
        runId: string;
        previewHash: string;
        preview: { blockers: string[] };
      };
      expect(p.preview.blockers).toEqual([]);
      expect(
        await restoreWorkspace(target, {
          clientCommandId: randomUUID(),
          runId: p.runId,
          previewHash: p.previewHash,
          confirmation: "replace-private-workspace",
        }),
      ).toMatchObject({ restored: true });
      const result = await exportWorkspace(target);
      expect(
        result.entities
          .find((e) => e.kind === "finance.financial_action")!
          .records.some((r) => r.description === account.accountId),
      ).toBe(true);
      expect(
        result.entities.find((e) => e.kind === "finance.financial_account")!
          .records[0]!.id,
      ).not.toBe(
        bundle.entities.find((e) => e.kind === "finance.financial_account")!
          .records[0]!.id,
      );
      expect(
        (await exportWorkspace(source)).entities.find(
          (e) => e.kind === "finance.financial_account",
        )!.records[0]!.id,
      ).toBe(
        bundle.entities.find((e) => e.kind === "finance.financial_account")!
          .records[0]!.id,
      );
    });
  }));
it("rejects an unbalanced replacement atomically and keeps the original active workspace", async () =>
  fixture(async (a) => {
    const bundle = await exportWorkspace(a);
    const row = bundle.entities.find((e) => e.kind === "finance.posting")!
      .records[0]!;
    row.amount_minor = (BigInt(String(row.amount_minor)) + 1n).toString();
    const { checksumSha256: ignored, ...unsigned } = bundle;
    void ignored;
    bundle.checksumSha256 = previewDigest(unsigned);
    const p = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle,
    })) as { runId: string; previewHash: string };
    expect(
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: p.runId,
        previewHash: p.previewHash,
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: false });
    const after = await exportWorkspace(a);
    expect(
      after.entities
        .find((e) => e.kind === "finance.posting")!
        .records.reduce((n, p) => n + BigInt(String(p.amount_minor)), 0n),
    ).toBe(0n);
  }));
it("keeps unlinked bytes inaccessible and retryable until acknowledged storage deletion", async () =>
  fixture(async (a, account) => {
    const { store, scanner } = adapters();
    const f = (await reserveAttachment(
      a,
      {
        clientCommandId: randomUUID(),
        sourceKind: "financial_action",
        sourceId: account.openingActionId!,
        originalFilename: "orphan.pdf",
        declaredMime: "application/pdf",
        declaredBytes: body.length,
      },
      false,
    )) as { attachmentId: string };
    await uploadAttachment(a, f.attachmentId, randomUUID(), body, store);
    await processAttachment(
      worker,
      { schemaVersion: 1, attachmentId: f.attachmentId },
      store,
      scanner,
    );
    const rows = await listAttachments(
      a,
      "financial_action",
      account.openingActionId!,
    );
    await mutateAttachment(a, {
      clientCommandId: randomUUID(),
      attachmentId: f.attachmentId,
      sourceKind: "financial_action",
      sourceId: account.openingActionId!,
      operation: "unlink",
      expectedVersion: Number(rows[0]!.version),
    });
    await expect(downloadAttachment(a, f.attachmentId, store)).rejects.toThrow(
      "FILE_UNLINKED",
    );
    const orphan = (await unlinkedAttachments(a))[0]!;
    const c = {
      clientCommandId: randomUUID(),
      attachmentId: f.attachmentId,
      operation: "delete" as const,
      expectedVersion: Number(orphan.version),
    };
    await mutateAttachment(a, c);
    expect(await mutateAttachment(a, c)).toMatchObject({ operation: "delete" });
    const bad = {
      ...store,
      async delete() {
        throw Error("Storage unavailable");
      },
    };
    expect(
      await processAttachment(
        worker,
        { schemaVersion: 1, attachmentId: f.attachmentId },
        bad,
        scanner,
      ),
    ).toEqual({ processed: false });
    expect((await unlinkedAttachments(a))[0]!.status).toBe("deleting");
  }));

it("round-trips card purchase, statement, allocation, installment, Career and agenda evidence without new financial recognition", async () =>
  fixture(async (a, account) => {
    const card = await createCreditCard({
      ...a,
      clientCommandId: randomUUID(),
      name: "Portable card",
      issuerName: "Synthetic provider",
    });
    const purchase = await recordCardPurchase({
      ...a,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      effectiveDate: "2026-08-01",
      postingDate: "2026-08-02",
      purchaseMinor: "300000",
      splits: [{ amountMinor: "300000", categoryId: null }],
      description: "Portable recognized purchase",
    });
    await recordCardInstallmentPlan({
      ...a,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      purchaseActionId: purchase.actionId,
      purchaseActionRevisionId: purchase.actionRevisionId,
      principalMinor: "300000",
      installmentCount: 3,
      providerConfirmed: true,
      verificationSource: "Synthetic provider schedule",
      verifiedDate: "2026-08-03",
      installments: ["2026-09-01", "2026-10-01", "2026-11-01"].map(
        (dueDate) => ({
          dueDate,
          principalMinor: "100000",
          interestMinor: "0",
          feeMinor: "0",
          totalMinor: "100000",
        }),
      ),
    });
    const payment = await recordCardCommand({
      ...a,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      actionKind: "card_payment",
      payingAccountId: account.accountId,
      amountMinor: "10000",
      effectiveDate: "2026-09-03",
      postingDate: "2026-09-04",
      description: "Actual payment",
      providerConfirmed: true,
      confirmationSource: "Synthetic provider payment",
    });
    const statement = await recordCardStatement({
      ...a,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      cycleStart: "2026-08-01",
      cycleEnd: "2026-08-31",
      statementDate: "2026-09-01",
      dueDate: "2026-09-20",
      balanceMinor: "300000",
      minimumDueMinor: "10000",
      verificationSource: "Synthetic provider statement",
      verifiedDate: "2026-09-02",
      entries: [],
    });
    await recordCardAllocation({
      ...a,
      clientCommandId: randomUUID(),
      cardId: card.cardId,
      statementRevisionId: statement.revisionId,
      sourceActionRevisionId: payment.actionRevisionId,
      amountMinor: "10000",
      confirmationKind: "provider",
      confirmationSource: "Confirmed application",
      confirmedDate: "2026-09-05",
    });
    await createJobApplication({
      ...a,
      clientCommandId: randomUUID(),
      companyName: "Portable company",
      roleTitle: "Engineer",
      initialStageEffectiveDate: "2026-09-01",
    });
    await createPersonalEvent({
      ...a,
      clientCommandId: randomUUID(),
      title: "Portable event",
      temporalKind: "date",
      eventDate: "2026-12-01",
    });
    const before = await exportWorkspace(a);
    expect(bundleTotals(before)).toMatchObject({
      cashMinor: "90000",
      expenseMinor: "300000",
      incomeMinor: "0",
    });
    const p = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle: before,
    })) as { runId: string; previewHash: string };
    const outcome = await restoreWorkspace(a, {
      clientCommandId: randomUUID(),
      runId: p.runId,
      previewHash: p.previewHash,
      confirmation: "replace-private-workspace",
    });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ restored: true });
    const after = await exportWorkspace(a);
    for (const kind of [
      "finance.posting",
      "finance.card_installment",
      "finance.card_statement_allocation",
      "career.job_application",
      "time.personal_event",
    ])
      expect(after.entities.find((e) => e.kind === kind)!.records).toEqual(
        before.entities.find((e) => e.kind === kind)!.records,
      );
  }));

async function syntheticAdmin(fn: (c: Client) => Promise<void>) {
  const u = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  u.pathname = "/personal_management_test";
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  try {
    if (
      (await c.query("SELECT current_database() n")).rows[0].n !==
      "personal_management_test"
    )
      throw Error();
    await fn(c);
  } finally {
    await c.end();
  }
}
it("expires CSV support data while retaining exact posted row provenance", async () =>
  fixture(async (a, account) => {
    const staged = (await stageImport(a, {
      clientCommandId: randomUUID(),
      csv: "date,kind,amount_minor,classification,description,reference\n2026-02-01,expense,1000,expense,Private import support,h-expiry\n",
      assumptions: assumptions(account.accountId),
    })) as { batchId: string; previewHash: string };
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "confirm",
      previewHash: staged.previewHash,
      decisions: [{ rowNo: 1, choice: "import", acknowledgeDuplicates: true }],
      acknowledgeNegativeBalance: true,
    });
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "process",
    });
    await syntheticAdmin(async (c) => {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role='replica'");
      await c.query(
        "UPDATE ops.import_batch SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND workspace_id=$2",
        [staged.batchId, a.workspaceId],
      );
      await c.query("COMMIT");
    });
    await worker.query("SELECT ops.expire_import_staging()");
    const r = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute(
            sql`SELECT r.state,r.normalized_json,r.financial_action_id IS NOT NULL AS action_retained,r.command_receipt_id IS NOT NULL AS receipt_retained,b.preview_json->'rows' AS preview_rows FROM ops.import_row r JOIN ops.import_batch b ON b.id=r.batch_id WHERE b.id=${staged.batchId}::uuid`,
          )
        ).rows[0],
    );
    expect(r).toEqual({
      state: "posted",
      normalized_json: null,
      action_retained: true,
      receipt_retained: true,
      preview_rows: [],
    });
  }));
it("purges owned attachment bytes before dropping metadata and resumes a failed storage acknowledgement", async () =>
  fixture(async (a, account) => {
    const { store, scanner } = adapters();
    const f = (await reserveAttachment(
      a,
      {
        clientCommandId: randomUUID(),
        sourceKind: "financial_action",
        sourceId: account.openingActionId!,
        originalFilename: "delete.pdf",
        declaredMime: "application/pdf",
        declaredBytes: body.length,
      },
      false,
    )) as { attachmentId: string };
    await uploadAttachment(a, f.attachmentId, randomUUID(), body, store);
    await processAttachment(
      worker,
      { schemaVersion: 1, attachmentId: f.attachmentId },
      store,
      scanner,
    );
    const c = await getDomainPool().connect();
    let requestId: string;
    try {
      requestId = (
        await runScopedTransactionOnClient(c, a, () =>
          makeDeletionPending(c, a),
        )
      ).requestId;
    } finally {
      c.release();
    }
    await syntheticAdmin(async (c) => {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role='replica'");
      await c.query(
        "UPDATE ops.deletion_request SET requested_at=clock_timestamp()-interval '8 days',purge_after=clock_timestamp()-interval '1 day' WHERE id=$1 AND target_user_id=$2",
        [requestId, a.userId],
      );
      await c.query("COMMIT");
    });
    const u = new URL(process.env.DATABASE_URL!);
    u.username = "lifecycle_operator";
    u.password = b.LIFECYCLE_OPERATOR_PASSWORD!;
    const op = new Client({ connectionString: u.toString() });
    await op.connect();
    try {
      for (let i = 0; i < 10; i++)
        if (
          (await purgeDeletionStep(op, requestId, 10000, store)).phase ===
          "private_graph"
        )
          break;
      await expect(
        purgeDeletionStep(op, requestId, 10000, {
          ...store,
          async delete() {
            throw Error("unavailable");
          },
        }),
      ).rejects.toThrow("unavailable");
      let state = "purging";
      for (let i = 0; i < 10 && state !== "completed"; i++)
        state = (await purgeDeletionStep(op, requestId, 10000, store)).state;
      expect(state).toBe("completed");
    } finally {
      await op.end();
    }
  }));

it("serializes concurrent chunk commands and resumes exactly once across the 50-row boundary", async () =>
  fixture(async (a, account) => {
    const csv =
      "date,kind,amount_minor,classification,description,reference\n" +
      Array.from(
        { length: 51 },
        (_, i) => "2026-02-01,expense,1,expense,Row " + i + ",concurrent-" + i,
      ).join("\n") +
      "\n";
    const staged = (await stageImport(a, {
      clientCommandId: randomUUID(),
      csv,
      assumptions: assumptions(account.accountId),
    })) as { batchId: string; previewHash: string };
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "confirm",
      previewHash: staged.previewHash,
      decisions: Array.from({ length: 51 }, (_, i) => ({
        rowNo: i + 1,
        choice: "import" as const,
        acknowledgeDuplicates: true,
      })),
      acknowledgeNegativeBalance: true,
    });
    const commands = Array.from({ length: 2 }, () => ({
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "process" as const,
    }));
    await Promise.all(commands.map((c) => controlImport(a, c)));
    await Promise.all(commands.map((c) => controlImport(a, c)));
    const status = (await importStatus(a, staged.batchId)) as {
      batch: { state: string };
      rows: { state: string }[];
    };
    expect(status.batch.state).toBe("completed");
    expect(status.rows.filter((r) => r.state === "posted")).toHaveLength(51);
  }));
it("cancels future chunks without deleting committed rows and requires duplicate acknowledgement", async () =>
  fixture(async (a, account) => {
    const csv =
      "date,kind,amount_minor,classification,description,reference\n" +
      Array.from(
        { length: 51 },
        (_, i) =>
          "2026-02-01,expense,1,expense,Cancel row " + i + ",cancel-" + i,
      ).join("\n") +
      "\n";
    const staged = (await stageImport(a, {
      clientCommandId: randomUUID(),
      csv,
      assumptions: assumptions(account.accountId),
    })) as { batchId: string; previewHash: string };
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "confirm",
      previewHash: staged.previewHash,
      decisions: Array.from({ length: 51 }, (_, i) => ({
        rowNo: i + 1,
        choice: "import" as const,
        acknowledgeDuplicates: true,
      })),
      acknowledgeNegativeBalance: true,
    });
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "process",
    });
    await controlImport(a, {
      clientCommandId: randomUUID(),
      batchId: staged.batchId,
      operation: "cancel",
    });
    await expect(
      controlImport(a, {
        clientCommandId: randomUUID(),
        batchId: staged.batchId,
        operation: "process",
      }),
    ).rejects.toThrow("IMPORT_NOT_CONFIRMED");
    const status = (await importStatus(a, staged.batchId)) as {
      rows: { state: string }[];
    };
    expect(status.rows.filter((r) => r.state === "posted")).toHaveLength(50);
    const duplicate = (await stageImport(a, {
      clientCommandId: randomUUID(),
      csv,
      assumptions: assumptions(account.accountId),
    })) as { batchId: string; previewHash: string };
    await expect(
      controlImport(a, {
        clientCommandId: randomUUID(),
        batchId: duplicate.batchId,
        operation: "confirm",
        previewHash: duplicate.previewHash,
        decisions: Array.from({ length: 51 }, (_, i) => ({
          rowNo: i + 1,
          choice: "import" as const,
          acknowledgeDuplicates: false,
        })),
        acknowledgeNegativeBalance: true,
      }),
    ).rejects.toThrow();
  }));
it("fails closed for infected evidence and denied runtime-role financial writes", async () =>
  fixture(async (a, account) => {
    const { store, scanner } = adapters();
    const f = (await reserveAttachment(
      a,
      {
        clientCommandId: randomUUID(),
        sourceKind: "financial_action",
        sourceId: account.openingActionId!,
        originalFilename: "infected.pdf",
        declaredMime: "application/pdf",
        declaredBytes: body.length,
      },
      false,
    )) as { attachmentId: string };
    await uploadAttachment(a, f.attachmentId, randomUUID(), body, store);
    await processAttachment(
      worker,
      { schemaVersion: 1, attachmentId: f.attachmentId },
      store,
      {
        async scan(v) {
          return { ...(await scanner.scan(v)), result: "infected" as const };
        },
      },
    );
    await expect(downloadAttachment(a, f.attachmentId, store)).rejects.toThrow(
      "FILE_NOT_AVAILABLE",
    );
    expect(
      (
        await listAttachments(a, "financial_action", account.openingActionId!)
      )[0]!.status,
    ).toBe("rejected");
    await expect(
      worker.query("DELETE FROM finance.financial_action WHERE false"),
    ).rejects.toMatchObject({ code: "42501" });
  }));

it("retains verified external effects across an older restore and rejects fabricated provider evidence", async () =>
  fixture(async (a) => {
    vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
    const date = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute<{ date: string }>(
            sql`SELECT ((clock_timestamp() AT TIME ZONE timezone)::date-1)::text date FROM core.workspace`,
          )
        ).rows[0]!.date,
    );
    await createPersonalEvent({
      ...a,
      clientCommandId: randomUUID(),
      title: "Historical notification source",
      temporalKind: "date",
      eventDate: date,
    });
    const older = await exportWorkspace(a);
    await saveNotificationPreferences(a, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences: {
        enabled: true,
        timezone: null,
        quietStart: null,
        quietEnd: null,
        includeDueDate: false,
      },
    });
    await syntheticAdmin(async (c) => {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role='replica'");
      await c.query(
        "UPDATE time.notification_preference SET enabled_at=clock_timestamp()-interval '3 days' WHERE workspace_id=$1",
        [a.workspaceId],
      );
      await c.query("COMMIT");
    });
    expect((await scanNotificationScope(worker, a)).scheduled).toBe(1);
    const delivery = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute<{ id: string }>(
            sql`SELECT id FROM time.notification_delivery`,
          )
        ).rows[0]!,
    );
    let sent = 0;
    await processNotificationEmail(
      worker,
      worker,
      { schemaVersion: 1, deliveryId: delivery.id },
      async () => {
        sent++;
        return { providerMessageId: randomUUID() };
      },
    );
    expect(sent).toBe(1);
    const verified = await exportWorkspace(a);
    const fabricated = structuredClone(verified);
    fabricated.entities.find(
      (e) => e.kind === "time.notification_attempt",
    )!.records[0]!.recipient_fingerprint = "f".repeat(64);
    const { checksumSha256: ignored, ...unsigned } = fabricated;
    void ignored;
    fabricated.checksumSha256 = previewDigest(unsigned);
    const bad = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle: fabricated,
    })) as { preview: { blockers: string[] } };
    expect(bad.preview.blockers).toContain(
      "UNVERIFIED_EXTERNAL_PROVIDER_HISTORY",
    );
    const p = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle: older,
    })) as { runId: string; previewHash: string };
    expect(
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: p.runId,
        previewHash: p.previewHash,
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: true });
    const proof = await withDomainTransaction(
      a,
      async (t) =>
        (
          await t.db.execute<{ n: string; enabled: boolean }>(
            sql`SELECT (SELECT count(*)::text FROM core.command_receipt WHERE command_type='portability.retire_notification') n,COALESCE((SELECT enabled FROM time.notification_preference),false) enabled`,
          )
        ).rows[0]!,
    );
    expect(proof).toEqual({ n: "1", enabled: false });
    await saveNotificationPreferences(a, {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      preferences: {
        enabled: true,
        timezone: null,
        quietStart: null,
        quietEnd: null,
        includeDueDate: false,
      },
    });
    expect((await scanNotificationScope(worker, a)).scheduled).toBe(0);
    const recover = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle: verified,
    })) as {
      runId: string;
      previewHash: string;
      preview: { blockers: string[] };
    };
    expect(recover.preview.blockers).toEqual([]);
    expect(
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: recover.runId,
        previewHash: recover.previewHash,
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: true });
  }));

it("keeps the reviewed portable graph aligned with database columns", async () => {
  for (const descriptor of graphRegistry) {
    const columns = await worker.query<{
      name: string;
      type: string;
      notNull: boolean;
    }>(
      'SELECT attname AS name,format_type(atttypid,atttypmod) AS type,attnotnull AS "notNull" FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname',
      [descriptor.kind],
    );
    expect(columns.rows, descriptor.kind).toEqual(
      descriptor.columns
        .map((c) => ({
          ...c,
          type: c.type === "time" ? "time without time zone" : c.type,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
});

it("rejects injected operational provider proofs in the database restore bridge", async () =>
  fixture(async (a) => {
    const bundle = await exportWorkspace(a);
    const preview = (await previewWorkspaceRestore(a, {
      clientCommandId: randomUUID(),
      bundle,
    })) as { runId: string; previewHash: string };
    const receipts = bundle.entities.find(
      (e) => e.kind === "core.command_receipt",
    )!;
    receipts.records.push({
      ...receipts.records[0]!,
      id: randomUUID(),
      client_command_id: randomUUID(),
      command_type: "portability.retire_notification",
      result_json: { sourceKeyHash: "f".repeat(64), providerEvidence: {} },
    });
    bundle.manifest.rowCount++;
    const { checksumSha256: ignored, ...unsigned } = bundle;
    void ignored;
    bundle.checksumSha256 = previewDigest(unsigned);
    // Synthetic administrator injection models a compromised application validator.
    // The restricted database bridge must independently reject these trusted proofs.
    await syntheticAdmin(async (c) => {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role='replica'");
      await c.query(
        "UPDATE ops.restore_run SET bundle_json=$1::jsonb WHERE id=$2",
        [JSON.stringify(bundle), preview.runId],
      );
      await c.query("COMMIT");
    });
    expect(
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: preview.runId,
        previewHash: preview.previewHash,
        confirmation: "replace-private-workspace",
      }),
    ).toMatchObject({ restored: false });
    expect(
      await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute<{ n: string }>(
              sql`SELECT count(*)::text n FROM core.command_receipt WHERE command_type='portability.retire_notification'`,
            )
          ).rows[0]!.n,
      ),
    ).toBe("0");
  }));
