import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  statementCommandSchema,
  statementEvidenceSchema,
  statementResultSchema,
  StatementConflictError,
  StatementUnavailableError,
  type StatementCommand,
} from "../domain/card-statement";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import { readStatementSnapshot } from "../repositories/card-statement-repository";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
} from "../repositories/financial-write-repository";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";

const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type StatementInput = StatementCommand & z.input<typeof actorSchema>;
function normalize(input: StatementInput) {
  const { userId, workspaceId, requestId, ...body } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: statementCommandSchema.parse(body),
  };
}
async function execute(
  t: ScopedTransaction,
  actor: z.output<typeof actorSchema>,
  body: z.output<typeof statementCommandSchema>,
) {
  await lockActiveFinancialWorkspace(t, actor.workspaceId);
  const { clientCommandId, ...intent } = body;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    clientCommandId,
    commandType: body.statementId
      ? "finance.revise_card_statement"
      : "finance.record_card_statement",
    payloadHash: hashFinancialCommandPayload({
      ...intent,
      statementId: intent.statementId ?? null,
      expectedVersion: intent.expectedVersion ?? null,
      reason: intent.reason ?? null,
    }),
  });
  if (receipt.kind === "replay")
    return statementResultSchema.parse(receipt.result);
  // Archived cards retain statement evidence; no new financial command is enabled.
  await getCreditCardDetailInTransaction(t, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
    cardId: body.cardId,
  });
  const statementId = body.statementId ?? randomUUID(),
    revisionId = randomUUID();
  let previousId: string | null = null,
    version = 1;
  if (body.statementId) {
    const root = await t.db.execute<{
      cardId: string;
      version: number;
      currentRevisionId: string;
    }>(
      sql`SELECT card_id AS "cardId",version,current_revision_id AS "currentRevisionId" FROM finance.card_statement WHERE workspace_id=${actor.workspaceId}::uuid AND id=${statementId}::uuid`,
    );
    if (!root.rows[0] || root.rows[0].cardId !== body.cardId)
      throw new StatementUnavailableError();
    if (root.rows[0].version !== body.expectedVersion)
      throw new StatementConflictError();
    version = root.rows[0].version + 1;
    previousId = root.rows[0].currentRevisionId;
  }
  const {
    cardId: _cardId,
    statementId: _statementId,
    expectedVersion: _version,
    reason: _reason,
    ...fields
  } = intent;
  void _cardId;
  void _statementId;
  void _version;
  void _reason;
  const evidence = statementEvidenceSchema.parse(fields);
  const duplicateCycle = await t.db.execute<{
    id: string;
  }>(sql`SELECT s.id FROM finance.card_statement s JOIN finance.card_statement_revision r ON r.workspace_id=s.workspace_id AND r.id=s.current_revision_id
    WHERE s.workspace_id=${actor.workspaceId}::uuid AND s.card_id=${body.cardId}::uuid AND s.id<>${statementId}::uuid AND r.cycle_start=${evidence.cycleStart}::date AND r.cycle_end=${evidence.cycleEnd}::date LIMIT 1`);
  if (duplicateCycle.rows.length) throw new StatementConflictError();
  const linkedActions = new Set<string>();
  // Validate references before inserting evidence so foreign and missing IDs have identical errors.
  for (const e of evidence.entries) {
    if (!e.actionRevisionId) continue;
    const source = await t.db.execute<{
      actionId: string;
      valid: boolean;
      occupied: boolean;
    }>(sql`
      SELECT r.action_id AS "actionId",(d.signed_liability_minor::text=${e.amountMinor} AND d.posting_date=${e.postingDate}::date
        AND (f.current_revision_id=r.id OR EXISTS(SELECT 1 FROM finance.card_statement_entry old WHERE old.workspace_id=r.workspace_id AND old.statement_revision_id=${previousId}::uuid AND old.action_revision_id=r.id))) AS valid,
        EXISTS(SELECT 1 FROM finance.card_statement s JOIN finance.card_statement_entry entry ON entry.workspace_id=s.workspace_id AND entry.statement_revision_id=s.current_revision_id
          JOIN finance.action_revision linked ON linked.workspace_id=entry.workspace_id AND linked.id=entry.action_revision_id
          WHERE s.workspace_id=r.workspace_id AND s.id<>${statementId}::uuid AND linked.action_id=r.action_id) AS occupied
      FROM finance.credit_card c JOIN finance.card_recognized_evidence_v d ON d.workspace_id=c.workspace_id AND d.card_id=c.id
      JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id
      JOIN finance.financial_action f ON f.workspace_id=r.workspace_id AND f.id=r.action_id
      WHERE c.workspace_id=${actor.workspaceId}::uuid AND c.id=${body.cardId}::uuid AND r.id=${e.actionRevisionId}::uuid`);
    if (!source.rows[0]) throw new StatementUnavailableError();
    if (!source.rows[0].valid || source.rows[0].occupied)
      throw new StatementConflictError();
    if (linkedActions.has(source.rows[0].actionId))
      throw new StatementConflictError();
    linkedActions.add(source.rows[0].actionId);
  }
  if (!body.statementId)
    await t.db.execute(
      sql`INSERT INTO finance.card_statement(id,workspace_id,card_id) VALUES(${statementId}::uuid,${actor.workspaceId}::uuid,${body.cardId}::uuid)`,
    );
  await t.db.execute(sql`
    INSERT INTO finance.card_statement_revision(id,workspace_id,statement_id,revision_no,previous_revision_id,command_receipt_id,cycle_start,cycle_end,statement_date,due_date,balance_minor,minimum_due_minor,opening_balance_minor,provider_reference,verification_source,verified_date,reason,recorded_by_user_id,request_id)
    VALUES(${revisionId}::uuid,${actor.workspaceId}::uuid,${statementId}::uuid,${version},${previousId}::uuid,${receipt.receiptId}::uuid,${evidence.cycleStart}::date,${evidence.cycleEnd}::date,${evidence.statementDate}::date,${evidence.dueDate}::date,${evidence.balanceMinor}::bigint,${evidence.minimumDueMinor}::bigint,${evidence.openingBalanceMinor}::bigint,${evidence.providerReference},${evidence.verificationSource},${evidence.verifiedDate}::date,${body.reason ?? null},${actor.userId}::uuid,${actor.requestId ?? null}::uuid)`);
  for (const [i, e] of evidence.entries.entries())
    await t.db.execute(sql`
    INSERT INTO finance.card_statement_entry(workspace_id,statement_revision_id,line_no,description,posting_date,amount_minor,provider_reference,action_revision_id)
    VALUES(${actor.workspaceId}::uuid,${revisionId}::uuid,${i + 1},${e.description},${e.postingDate}::date,${e.amountMinor}::bigint,${e.providerReference},${e.actionRevisionId}::uuid)`);
  const before = previousId
    ? await readStatementSnapshot(t, actor.workspaceId, statementId, previousId)
    : null;
  const beforeEvidence = before
    ? statementEvidenceSchema.parse(
        Object.fromEntries(
          Object.entries(before).filter(
            ([k]) => k in statementEvidenceSchema.shape,
          ),
        ),
      )
    : null;
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "card_statement",
    subjectId: statementId,
    subjectVersion: version,
    operation: version === 1 ? "create" : "replace",
    beforeJson: beforeEvidence,
    afterJson: evidence,
    reason: body.reason ?? null,
    effectiveDate: evidence.statementDate,
    recordedByUserId: actor.userId,
    actorKind: "user",
    requestId: actor.requestId ?? null,
  });
  await t.db.execute(
    sql`UPDATE finance.card_statement_revision SET state='verified',finalized_at=clock_timestamp() WHERE workspace_id=${actor.workspaceId}::uuid AND id=${revisionId}::uuid`,
  );
  if (version === 1)
    await t.db.execute(
      sql`UPDATE finance.card_statement SET current_revision_id=${revisionId}::uuid WHERE workspace_id=${actor.workspaceId}::uuid AND id=${statementId}::uuid`,
    );
  else
    await t.db.execute(
      sql`UPDATE finance.card_statement SET current_revision_id=${revisionId}::uuid,version=${version} WHERE workspace_id=${actor.workspaceId}::uuid AND id=${statementId}::uuid`,
    );
  const financialRevision = await advanceWorkspaceFinancialRevision(
    t,
    actor.workspaceId,
  );
  const result = { statementId, revisionId, version, financialRevision };
  await completeFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return statementResultSchema.parse(result);
}
export function recordCardStatementInTransaction(
  t: ScopedTransaction,
  input: StatementInput,
) {
  const { actor, body } = normalize(input);
  return execute(t, actor, body);
}
export function recordCardStatement(input: StatementInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (t) => execute(t, actor, body));
}
