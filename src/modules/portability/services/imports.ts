import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  withDomainTransaction,
  type ScopedDatabaseContext,
  type ScopedTransaction,
} from "@/platform/db";
import { lockActiveFinancialWorkspace } from "@/modules/finance/repositories/financial-write-repository";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
import { rebaseCashHistory } from "@/modules/finance/services/rebase-cash-history";
import {
  FileBoundaryError,
  sha256,
} from "@/modules/files/domain/supporting-file";
import {
  previewCashCsv,
  confirmCsvPreview,
  previewDigest,
  csvAssumptionsSchema,
  cashRowFingerprint,
  type CsvPreview,
  type CsvAssumptions,
  type NormalizedCashRow,
} from "../domain/csv-preview";
import { portableTargetId } from "../domain/portable-bundle";
export const stageImportSchema = z
  .object({
    clientCommandId: z.uuid(),
    csv: z.string().min(1).max(1048576),
    assumptions: csvAssumptionsSchema,
  })
  .strict();
export const importControlSchema = z
  .object({
    clientCommandId: z.uuid(),
    batchId: z.uuid(),
    operation: z.enum(["confirm", "process", "cancel"]),
    previewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    decisions: z
      .array(
        z
          .object({
            rowNo: z.number().int().min(1).max(500),
            choice: z.enum(["import", "skip"]),
            acknowledgeDuplicates: z.boolean(),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    acknowledgeNegativeBalance: z.boolean().optional(),
  })
  .strict();
async function importAudit(
  tx: ScopedTransaction,
  a: ScopedDatabaseContext,
  r: string,
  id: string,
  v: number,
  operation: string,
  after: Record<string, unknown>,
) {
  await createPrivateRevision(tx, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: r,
    subjectKind: "import_batch",
    subjectId: id,
    subjectVersion: v,
    operation,
    beforeJson: null,
    afterJson: after,
    reason: null,
    effectiveDate: null,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: null,
  });
}
export async function importSetup(a: ScopedDatabaseContext) {
  return withDomainTransaction(
    a,
    async (tx) =>
      (
        await tx.db.execute(
          sql`SELECT f.id,f.name,f.currency,f.opening_cutoff_date::text,f.version,COALESCE((SELECT sum(p.amount_minor)::text FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id JOIN finance.financial_action x ON x.workspace_id=p.workspace_id AND x.id=p.action_id WHERE x.id=f.opening_action_id AND p.action_revision_id=x.current_revision_id AND p.ledger_account_id=f.ledger_account_id AND j.role='economic'), '0') opening_minor FROM finance.financial_account f WHERE archived_at IS NULL ORDER BY name,id LIMIT 100`,
        )
      ).rows,
    { readOnlySnapshot: true },
  );
}
async function accountSnapshot(tx: ScopedTransaction, id: string) {
  const s = (
    await tx.db.execute<{
      currency: string;
      accountId: string;
      cutoffDate: string;
      openingMinor: string;
      accountVersion: number;
      financialRevision: string;
      asOfDate: string;
      openingActionId: string | null;
      openingRevisionId: string | null;
    }>(
      sql`SELECT f.currency,f.id AS "accountId",f.opening_cutoff_date::text AS "cutoffDate",f.version AS "accountVersion",w.financial_revision::text AS "financialRevision",(clock_timestamp() AT TIME ZONE w.timezone)::date::text AS "asOfDate",f.opening_action_id AS "openingActionId",x.current_revision_id AS "openingRevisionId",COALESCE((SELECT sum(p.amount_minor)::text FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id WHERE p.action_revision_id=x.current_revision_id AND p.ledger_account_id=f.ledger_account_id AND j.role='economic'), '0') AS "openingMinor" FROM finance.financial_account f JOIN core.workspace w ON w.id=f.workspace_id LEFT JOIN finance.financial_action x ON x.workspace_id=f.workspace_id AND x.id=f.opening_action_id WHERE f.id=${id}::uuid AND f.archived_at IS NULL`,
    )
  ).rows[0];
  if (!s) throw new FileBoundaryError("IMPORT_ACCOUNT_UNAVAILABLE");
  return s;
}
export async function stageImport(
  a: ScopedDatabaseContext,
  raw: z.input<typeof stageImportSchema>,
) {
  const c = stageImportSchema.parse(raw);
  return withDomainTransaction(a, async (tx) => {
    await lockActiveFinancialWorkspace(tx, a.workspaceId);
    const receipt = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "imports.stage",
      payloadHash: hashCommandPayload(JSON.parse(JSON.stringify(c))),
    });
    if (receipt.kind === "replay") return receipt.result;
    const snapshot = await accountSnapshot(tx, c.assumptions.targetAccountId),
      { openingActionId, openingRevisionId, ...snapshotValues } = snapshot;
    const batchId = randomUUID();
    const existing = (
      await tx.db.execute<{
        effective_date: string;
        amount: string;
        kind: string;
        classification: string;
        description: string;
        reference: string | null;
      }>(
        sql`SELECT x.description,x.reference,r.primary_effective_date::text effective_date,r.action_kind kind,abs(p.amount_minor)::text amount,COALESCE((SELECT q.income_class FROM finance.posting q WHERE q.workspace_id=p.workspace_id AND q.action_revision_id=p.action_revision_id AND q.income_class IN ('earned','gift','reward','other') LIMIT 1),'expense') classification FROM finance.financial_action x JOIN finance.action_revision r ON r.workspace_id=x.workspace_id AND r.id=x.current_revision_id JOIN finance.posting p ON p.workspace_id=r.workspace_id AND p.action_revision_id=r.id JOIN finance.financial_account f ON f.workspace_id=p.workspace_id AND f.ledger_account_id=p.ledger_account_id WHERE f.id=${snapshot.accountId}::uuid AND r.action_kind IN ('expense','income') AND r.change_kind<>'void' AND p.reverses_posting_id IS NULL LIMIT 10001`,
      )
    ).rows;
    if (existing.length > 10000)
      throw new FileBoundaryError("IMPORT_DUPLICATE_SCAN_LIMIT");
    const fingerprints = new Set(
      existing.map((e) =>
        cashRowFingerprint({
          effectiveDate: e.effective_date,
          kind: e.kind as "expense" | "income",
          amountMinor: e.amount,
          classification:
            e.classification as NormalizedCashRow["classification"],
          description: e.description,
          reference: e.reference,
        } as NormalizedCashRow),
      ),
    );
    const checksumSeen =
      (
        await tx.db.execute(
          sql`SELECT id FROM ops.import_batch WHERE file_checksum=decode(${sha256(Buffer.from(c.csv))},'hex') LIMIT 1`,
        )
      ).rows.length > 0;
    const preview = previewCashCsv({
      workspaceId: a.workspaceId,
      batchId,
      bytes: Buffer.from(c.csv),
      assumptions: c.assumptions as CsvAssumptions,
      snapshot: snapshotValues,
      existingFingerprints: fingerprints,
      existingReferences: new Set(
        existing.flatMap((e) => (e.reference ? [e.reference] : [])),
      ),
      identicalFileSeen: checksumSeen,
    });
    // The dedicated rebase command is now implemented. The source linkage and
    // coverage equation are additionally verified at confirmation/activation.
    if (c.assumptions.cutoffStrategy === "rebase_history") {
      preview.blockers = [];
      void openingActionId;
      void openingRevisionId;
    }
    const { previewHash: _old, ...unsigned } = preview;
    void _old;
    preview.previewHash = previewDigest(unsigned);
    await tx.db.execute(
      sql`INSERT INTO ops.import_batch(id,workspace_id,source_format,format_version,file_checksum,mapping_json,date_interpretation,currency,target_account_id,cutoff_strategy,cutoff_date,preview_hash,command_receipt_id,preview_json,expires_at) VALUES(${batchId}::uuid,${a.workspaceId}::uuid,'pmp-cash-activity',1,decode(${preview.fileChecksum},'hex'),${JSON.stringify(c.assumptions.mapping)}::jsonb,${c.assumptions.dateInterpretation},${c.assumptions.currency},${snapshot.accountId}::uuid,${c.assumptions.cutoffStrategy},${snapshot.cutoffDate}::date,decode(${preview.previewHash},'hex'),${receipt.receiptId}::uuid,${JSON.stringify(preview)}::jsonb,clock_timestamp()+interval '30 days')`,
    );
    for (const row of preview.rows)
      await tx.db.execute(
        sql`INSERT INTO ops.import_row(workspace_id,batch_id,row_no,source_row_hash,normalized_json,validation_errors_json,state,client_command_id) VALUES(${a.workspaceId}::uuid,${batchId}::uuid,${row.rowNo},decode(${row.sourceRowHash},'hex'),${JSON.stringify(row.normalized)}::jsonb,${JSON.stringify(row.errors)}::jsonb,${row.errors.length ? "invalid" : "ready"},${row.clientCommandId}::uuid)`,
      );
    const result = { batchId, previewHash: preview.previewHash };
    await importAudit(tx, a, receipt.receiptId, batchId, 1, "imports.stage", {
      fileChecksum: preview.fileChecksum,
      rows: preview.rows.length,
      previewHash: preview.previewHash,
    });
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    return result;
  });
}
type Batch = {
  id: string;
  state: string;
  version: number;
  preview_json: CsvPreview;
  decisions_json: {
    decisions: NonNullable<z.infer<typeof importControlSchema>["decisions"]>;
    acknowledgeNegativeBalance: boolean;
  } | null;
  expires_at: string;
};
export async function importStatus(a: ScopedDatabaseContext, batchId?: string) {
  return withDomainTransaction(
    a,
    async (tx) => {
      if (!batchId)
        return {
          batches: (
            await tx.db.execute(
              sql`SELECT id,state,version,created_at::text FROM ops.import_batch ORDER BY created_at DESC,id LIMIT 50`,
            )
          ).rows,
        };
      z.uuid().parse(batchId);
      const b = (
        await tx.db.execute<Batch>(
          sql`SELECT id,state,version,preview_json,decisions_json,expires_at::text FROM ops.import_batch WHERE id=${batchId}::uuid`,
        )
      ).rows[0];
      if (!b) throw new FileBoundaryError("IMPORT_UNAVAILABLE");
      const rows = (
        await tx.db.execute(
          sql`SELECT row_no,state,safe_error_code,financial_action_id FROM ops.import_row WHERE batch_id=${batchId}::uuid ORDER BY row_no`,
        )
      ).rows;
      return { batch: b, rows };
    },
    { readOnlySnapshot: true },
  );
}
export async function controlImport(
  a: ScopedDatabaseContext,
  raw: z.input<typeof importControlSchema>,
) {
  const c = importControlSchema.parse(raw);
  return withDomainTransaction(a, async (tx) => {
    await lockActiveFinancialWorkspace(tx, a.workspaceId);
    const receipt = await claimCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: `imports.${c.operation}`,
      payloadHash: hashCommandPayload(JSON.parse(JSON.stringify(c))),
    });
    if (receipt.kind === "replay") return receipt.result;
    await tx.db.execute(
      sql`SELECT set_config('imports.receipt_id',${receipt.receiptId},true)`,
    );
    const b = (
      await tx.db.execute<Batch>(
        sql`SELECT id,state,version,preview_json,decisions_json,expires_at::text FROM ops.import_batch WHERE id=${c.batchId}::uuid FOR UPDATE`,
      )
    ).rows[0];
    if (!b) throw new FileBoundaryError("IMPORT_UNAVAILABLE");
    const p = b.preview_json;
    if (Date.parse(b.expires_at) < Date.now() && b.state === "previewed")
      throw new FileBoundaryError("IMPORT_PREVIEW_EXPIRED");
    const result = { batchId: b.id, commandAccepted: true };
    if (c.operation === "confirm") {
      if (
        b.state !== "previewed" ||
        !c.previewHash ||
        !c.decisions ||
        c.acknowledgeNegativeBalance === undefined
      )
        throw new FileBoundaryError("IMPORT_CONFIRMATION_REQUIRED");
      const s = await accountSnapshot(tx, p.assumptions.targetAccountId);
      const selected = confirmCsvPreview(p, {
        previewHash: c.previewHash,
        financialRevision: s.financialRevision,
        accountVersion: s.accountVersion,
        decisions: c.decisions,
      });
      if (p.assumptions.cutoffStrategy === "rebase_history") {
        const net = selected
          .filter(
            (r) => r.normalized!.effectiveDate <= p.assumptions.cutoffDate,
          )
          .reduce(
            (n, r) =>
              n +
              (r.normalized!.kind === "income" ? 1n : -1n) *
                BigInt(r.normalized!.amountMinor),
            0n,
          );
        if (
          BigInt(p.assumptions.earlierOpeningMinor!) + net !==
          BigInt(p.openingMinor)
        )
          throw new FileBoundaryError("IMPORT_REBASE_COVERAGE_MISMATCH");
      }
      await tx.db.execute(
        sql`UPDATE ops.import_batch SET state='confirmed',confirmed_preview_hash=preview_hash,confirmed_at=clock_timestamp(),decisions_json=${JSON.stringify({ decisions: c.decisions, acknowledgeNegativeBalance: c.acknowledgeNegativeBalance })}::jsonb,version=version+1 WHERE id=${b.id}::uuid`,
      );
      for (const d of c.decisions)
        if (d.choice === "skip")
          await tx.db.execute(
            sql`UPDATE ops.import_row SET state='skipped' WHERE batch_id=${b.id}::uuid AND row_no=${d.rowNo}`,
          );
    } else if (c.operation === "cancel") {
      if (b.state === "completed" || b.state === "cancelled")
        throw new FileBoundaryError("IMPORT_ALREADY_TERMINAL");
      await tx.db.execute(
        sql`UPDATE ops.import_batch SET state='cancelled',version=version+1 WHERE id=${b.id}::uuid`,
      );
    } else {
      if (
        !["confirmed", "partial", "running"].includes(b.state) ||
        !b.decisions_json
      )
        throw new FileBoundaryError("IMPORT_NOT_CONFIRMED");
      await tx.db.execute(
        sql`UPDATE ops.import_batch SET state='running',version=version+1 WHERE id=${b.id}::uuid`,
      );
    }
    await importAudit(
      tx,
      a,
      receipt.receiptId,
      b.id,
      b.version + 1,
      `imports.${c.operation}`,
      { operation: c.operation, previewHash: p.previewHash },
    );
    await completeCommandReceipt(tx, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    if (c.operation === "process") {
      const all = (
        await tx.db.execute<{
          id: string;
          row_no: number;
          state: string;
          client_command_id: string;
          normalized_json: NormalizedCashRow;
        }>(
          sql`SELECT id,row_no,state,client_command_id,normalized_json FROM ops.import_row WHERE batch_id=${b.id}::uuid AND state IN ('ready','failed') ORDER BY row_no`,
        )
      ).rows;
      const countPosted = Number(
        (
          await tx.db.execute<{ n: string }>(
            sql`SELECT count(*)::text n FROM ops.import_row WHERE batch_id=${b.id}::uuid AND state='posted'`,
          )
        ).rows[0]!.n,
      );
      const s = await accountSnapshot(tx, p.assumptions.targetAccountId);
      if (
        !countPosted &&
        b.state === "confirmed" &&
        (s.financialRevision !== p.financialRevision ||
          s.accountVersion !== p.accountVersion)
      )
        throw new FileBoundaryError("IMPORT_PREVIEW_STALE");
      let rebase = false;
      if (
        p.assumptions.cutoffStrategy === "rebase_history" &&
        s.cutoffDate === p.assumptions.cutoffDate
      ) {
        rebase = true;
        await rebaseCashHistory(tx, a, {
          batchId: b.id,
          accountId: s.accountId,
          openingActionId: s.openingActionId,
          openingRevisionId: s.openingRevisionId,
          clientCommandId: portableTargetId(
            a.workspaceId,
            b.id,
            "ops.import_batch",
            b.id,
          ),
          expectedFinancialRevision: s.financialRevision,
          earlierDate: p.assumptions.earlierOpeningDate!,
          earlierMinor: p.assumptions.earlierOpeningMinor!,
          acknowledgeNegativeBalance:
            b.decisions_json!.acknowledgeNegativeBalance,
        });
      }
      const selected = rebase
        ? all.filter(
            (r) => r.normalized_json.effectiveDate <= p.assumptions.cutoffDate,
          )
        : all.slice(0, 50);
      for (const row of selected) {
        await tx.db.execute(sql`SAVEPOINT import_row_write`);
        try {
          const n = row.normalized_json,
            common = {
              userId: a.userId,
              workspaceId: a.workspaceId,
              clientCommandId: row.client_command_id,
              effectiveDate: n.effectiveDate,
              description: n.description,
              reference: n.reference,
              acknowledgeNegativeBalance:
                b.decisions_json!.acknowledgeNegativeBalance,
            };
          const posted =
            n.kind === "expense"
              ? await recordExpenseInTransaction(tx, {
                  ...common,
                  fundingAccountId: p.assumptions.targetAccountId,
                  purchaseMinor: n.amountMinor,
                  splits: [
                    {
                      amountMinor: n.amountMinor,
                      categoryId: null,
                      memo: null,
                    },
                  ],
                })
              : await recordIncomeInTransaction(tx, {
                  ...common,
                  receivingAccountId: p.assumptions.targetAccountId,
                  amountMinor: n.amountMinor,
                  incomeClass: n.classification as
                    "earned" | "gift" | "reward" | "other",
                });
          await tx.db.execute(
            sql`UPDATE ops.import_row SET state='posted',financial_action_id=${posted.actionId}::uuid,command_receipt_id=(SELECT id FROM core.command_receipt WHERE client_command_id=${row.client_command_id}::uuid),processed_at=clock_timestamp(),safe_error_code=NULL WHERE id=${row.id}::uuid`,
          );
          await tx.db.execute(sql`RELEASE SAVEPOINT import_row_write`);
        } catch {
          await tx.db.execute(sql`ROLLBACK TO SAVEPOINT import_row_write`);
          await tx.db.execute(sql`RELEASE SAVEPOINT import_row_write`);
          if (rebase)
            throw new FileBoundaryError("IMPORT_REBASE_ATOMIC_ROW_FAILURE");
          await tx.db.execute(
            sql`UPDATE ops.import_row SET state='failed',safe_error_code='IMPORT_ROW_REJECTED' WHERE id=${row.id}::uuid`,
          );
        }
      }
      const pending = Number(
        (
          await tx.db.execute<{ n: string }>(
            sql`SELECT count(*)::text n FROM ops.import_row WHERE batch_id=${b.id}::uuid AND state IN ('ready','failed')`,
          )
        ).rows[0]!.n,
      );
      await tx.db.execute(
        sql`UPDATE ops.import_batch SET state=${pending ? "partial" : "completed"} WHERE id=${b.id}::uuid`,
      );
    }
    return result;
  });
}
