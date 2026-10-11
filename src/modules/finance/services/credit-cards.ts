import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  createCreditCardInputSchema,
  updateCreditCardInputSchema,
  creditCardMetadataSchema,
  CreditCardVersionConflictError,
  type CreateCreditCardInput,
  type UpdateCreditCardInput,
} from "@/modules/finance/domain/credit-card";
import { hashFinancialCommandPayload } from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import {
  insertCreditCard,
  readCreditCardIdentity,
  updateCreditCardMetadata,
} from "@/modules/finance/repositories/credit-card-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  lockActiveFinancialWorkspace,
} from "@/modules/finance/repositories/financial-write-repository";
import { getCreditCardDetailInTransaction } from "@/modules/finance/services/read-credit-cards";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const resultSchema = z.object({
  cardId: z.uuid(),
  liabilityLedgerAccountId: z.uuid(),
  version: z.number().int().positive(),
  financialRevision: z.string().regex(/^\d+$/),
});
export type CreditCardCommandResult = z.infer<typeof resultSchema>;

async function execute(
  transaction: ScopedTransaction,
  input:
    | z.output<typeof createCreditCardInputSchema>
    | z.output<typeof updateCreditCardInputSchema>,
): Promise<CreditCardCommandResult> {
  const workspace = await lockActiveFinancialWorkspace(
    transaction,
    input.workspaceId,
  );
  // Metadata has already been parsed. Pick its fields without admitting the
  // trusted server context or request attribution into the canonical intent.
  const metadata = creditCardMetadataSchema.parse({
    name: input.name,
    issuerName: input.issuerName,
    creditLimitMinor: input.creditLimitMinor,
    limitVerifiedDate: input.limitVerifiedDate,
    notes: input.notes,
  });
  const update = "cardId" in input;
  const payload = update
    ? {
        ...metadata,
        cardId: input.cardId,
        expectedVersion: input.expectedVersion,
        archived: input.archived,
      }
    : metadata;
  const receipt = await claimFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    clientCommandId: input.clientCommandId,
    commandType: update
      ? "finance.update_credit_card"
      : "finance.create_credit_card",
    payloadHash: hashFinancialCommandPayload(payload),
  });
  if (receipt.kind === "replay") return resultSchema.parse(receipt.result);

  let cardId: string;
  let liabilityLedgerAccountId: string;
  let version: number;
  let beforeJson: Record<string, unknown> | null = null;
  if (update) {
    const before = await getCreditCardDetailInTransaction(transaction, {
      userId: input.userId,
      workspaceId: input.workspaceId,
      cardId: input.cardId,
    });
    if (before.card.version !== input.expectedVersion)
      throw new CreditCardVersionConflictError();
    beforeJson = before.card;
    // The ledger identity is deliberately absent from browser/read DTOs.
    const identity = await readCreditCardIdentity(transaction, input);
    if (!identity)
      throw new Error("Locked card identity could not be resolved.");
    cardId = input.cardId;
    liabilityLedgerAccountId = identity.ledgerId;
    const changed = await updateCreditCardMetadata(transaction, input);
    if (!changed) throw new CreditCardVersionConflictError();
    version = changed.version;
  } else {
    cardId = randomUUID();
    liabilityLedgerAccountId = randomUUID();
    version = 1;
    await insertCreditCard(transaction, {
      ...input,
      id: cardId,
      liabilityLedgerAccountId,
      currency: workspace.currency,
      requestId: input.requestId ?? null,
    });
  }

  await createPrivateFinancialRevision(transaction, {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "credit_card",
    subjectId: cardId,
    subjectVersion: version,
    operation: update ? "update" : "create",
    beforeJson,
    afterJson: {
      ...metadata,
      liabilityLedgerAccountId,
      currency: workspace.currency,
      archived: update ? input.archived : false,
    },
    effectiveDate: null,
    recordedByUserId: input.userId,
    requestId: input.requestId ?? null,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    transaction,
    input.workspaceId,
  );
  const result = {
    cardId,
    liabilityLedgerAccountId,
    version,
    financialRevision,
  };
  await completeFinancialCommandReceipt(transaction, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(transaction);
  return result;
}

export async function createCreditCardInTransaction(
  transaction: ScopedTransaction,
  input: CreateCreditCardInput,
) {
  return execute(transaction, createCreditCardInputSchema.parse(input));
}
export async function updateCreditCardInTransaction(
  transaction: ScopedTransaction,
  input: UpdateCreditCardInput,
) {
  return execute(transaction, updateCreditCardInputSchema.parse(input));
}
export async function createCreditCard(input: CreateCreditCardInput) {
  const parsed = createCreditCardInputSchema.parse(input);
  return withDomainTransaction(parsed, (t) => execute(t, parsed));
}
export async function updateCreditCard(input: UpdateCreditCardInput) {
  const parsed = updateCreditCardInputSchema.parse(input);
  return withDomainTransaction(parsed, (t) => execute(t, parsed));
}
