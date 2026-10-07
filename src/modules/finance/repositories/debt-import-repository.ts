import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import {
  openingBreakdownStatus,
  type ValidatedImportDebt,
} from "@/modules/finance/domain/debt";
import {
  createFinancialAction,
  createOpeningJournal,
  createOpeningPosting,
} from "@/modules/finance/repositories/financial-account-repository";
import type { ScopedTransaction } from "@/platform/db";
import {
  debt,
  debtActionLink,
  debtObligation,
  debtScheduleVersion,
  scheduledInstallment,
  ledgerAccount,
  actionRevision,
  posting,
} from "@/platform/db/schema/finance";

export async function insertImportedDebt(
  transaction: ScopedTransaction,
  input: ValidatedImportDebt & {
    workspaceId: string;
    userId: string;
    requestId: string | null;
    currency: string;
    receiptId: string;
  },
) {
  const debtId = randomUUID();
  const liabilityId = randomUUID();
  const equityId = randomUUID();
  const actionId = randomUUID();
  const revisionId = randomUUID();
  const journalId = randomUUID();
  const scheduleId = randomUUID();
  const scope = { workspaceId: input.workspaceId };
  const attribution = {
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  };
  await transaction.db.insert(ledgerAccount).values([
    {
      ...scope,
      id: liabilityId,
      code: `debt:${debtId}`,
      name: input.name,
      kind: "debt_liability",
      currency: input.currency,
    },
    {
      ...scope,
      id: equityId,
      code: `opening-equity:${debtId}`,
      name: "Opening Equity",
      kind: "opening_equity",
      currency: input.currency,
    },
  ]);
  await transaction.db.insert(debt).values({
    ...scope,
    ...attribution,
    id: debtId,
    name: input.name,
    lenderName: input.lenderName,
    productName: input.productName,
    debtType: input.debtType,
    currency: input.currency,
    liabilityLedgerAccountId: liabilityId,
    originalPrincipalMinor:
      input.originalPrincipalMinor === null
        ? null
        : BigInt(input.originalPrincipalMinor),
    startDate: input.startDate,
    openingCutoffDate: input.openingCutoffDate,
    breakdownStatus: openingBreakdownStatus(input.openingComponents),
    currentScheduleVersionId: scheduleId,
    notes: input.notes,
  });
  await createFinancialAction(transaction, {
    ...scope,
    id: actionId,
    commandReceiptId: input.receiptId,
    currentRevisionId: revisionId,
    description: `Opening liability for ${input.name}`,
    recordedByUserId: input.userId,
    requestId: input.requestId,
  });
  await transaction.db.insert(actionRevision).values({
    ...scope,
    ...attribution,
    id: revisionId,
    actionId,
    revisionNo: 1,
    commandReceiptId: input.receiptId,
    changeKind: "create",
    actionKind: "opening_debt",
    primaryEffectiveDate: input.openingCutoffDate,
    currency: input.currency,
  });
  await transaction.db.insert(debtActionLink).values({
    ...scope,
    actionId,
    actionRevisionId: revisionId,
    debtId,
    purpose: "opening",
  });
  await createOpeningJournal(transaction, {
    ...scope,
    id: journalId,
    actionId,
    actionRevisionId: revisionId,
    effectiveDate: input.openingCutoffDate,
    currency: input.currency,
  });
  await createOpeningPosting(transaction, {
    ...scope,
    id: randomUUID(),
    actionId,
    actionRevisionId: revisionId,
    journalId,
    ledgerAccountId: equityId,
    currency: input.currency,
    lineNo: 1,
    amountMinor: BigInt(input.openingLiabilityMinor),
    cashFlowKind: "none",
    cashFlowDirection: "none",
  });
  await transaction.db.insert(posting).values(
    input.openingComponents.map((component, index) => ({
      ...scope,
      actionId,
      actionRevisionId: revisionId,
      journalId,
      ledgerAccountId: liabilityId,
      currency: input.currency,
      lineNo: index + 2,
      amountMinor: -BigInt(component.amountMinor),
      liabilityComponent: component.kind,
    })),
  );
  await transaction.db.insert(debtScheduleVersion).values({
    ...scope,
    ...attribution,
    id: scheduleId,
    debtId,
    versionNo: 1,
    effectiveDate: input.openingCutoffDate,
    revisionKind: "initial",
    reason: input.scheduleReason,
    frequency: "manual",
  });
  for (const [index, row] of input.installments.entries()) {
    const obligationId = randomUUID();
    await transaction.db
      .insert(debtObligation)
      .values({ ...scope, ...attribution, id: obligationId, debtId });
    await transaction.db.insert(scheduledInstallment).values({
      ...scope,
      debtId,
      scheduleVersionId: scheduleId,
      obligationId,
      sequenceNo: index + 1,
      dueDate: row.dueDate,
      contractualMinor: BigInt(row.contractualMinor),
      openingSatisfiedMinor: BigInt(row.openingSatisfiedMinor),
      knownPrincipalMinor:
        row.knownPrincipalMinor === null
          ? null
          : BigInt(row.knownPrincipalMinor),
      knownInterestMinor:
        row.knownInterestMinor === null ? null : BigInt(row.knownInterestMinor),
      knownFeeMinor:
        row.knownFeeMinor === null ? null : BigInt(row.knownFeeMinor),
      breakdownComplete: row.breakdownComplete,
      notes: row.notes,
    });
  }
  await transaction.db
    .execute(sql`UPDATE finance.debt_schedule_version SET state='finalized', finalized_at=clock_timestamp()
    WHERE workspace_id=${input.workspaceId}::uuid AND id=${scheduleId}::uuid AND state='building'`);
  return { debtId, actionId, revisionId, journalId, scheduleId };
}
