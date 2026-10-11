import { z } from "zod";

import {
  CreditCardUnavailableError,
  deriveCardPosition,
} from "@/modules/finance/domain/credit-card";
import {
  readCreditCards,
  type CreditCardQueryRow,
} from "@/modules/finance/repositories/credit-card-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { parseMinorUnits } from "@/shared/money";

const contextSchema = z
  .object({ userId: z.uuid(), workspaceId: z.uuid() })
  .strict();
const listSchema = contextSchema.extend({
  includeArchived: z.boolean().default(false),
  pageSize: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(10_000).default(0),
});
const detailSchema = contextSchema.extend({ cardId: z.uuid() });

export type CreditCardListInput = z.input<typeof listSchema>;
export type CreditCardDetailInput = z.input<typeof detailSchema>;

function mapCard(row: CreditCardQueryRow) {
  if (
    !row.card_id ||
    !row.name ||
    !row.issuer_name ||
    !row.currency ||
    row.version === null ||
    !row.liability_ledger_account_id
  ) {
    throw new Error("Credit card query returned an incomplete card.");
  }
  return {
    cardId: row.card_id,
    name: row.name,
    issuerName: row.issuer_name,
    currency: row.currency,
    creditLimitMinor:
      row.credit_limit_minor === null
        ? null
        : parseMinorUnits(row.credit_limit_minor).toString(),
    limitVerifiedDate: row.limit_verified_date,
    notes: row.notes,
    archived: row.archived,
    version: row.version,
    ...deriveCardPosition(row.signed_ledger_minor),
  };
}

export type CreditCardReadModel = ReturnType<typeof mapCard>;

export async function listCreditCardsInTransaction(
  transaction: ScopedTransaction,
  input: CreditCardListInput,
) {
  const parsed = listSchema.parse(input);
  const rows = await readCreditCards(transaction, {
    ...parsed,
    cardId: null,
    pageSize: parsed.pageSize + 1,
  });
  if (!rows[0]) throw new CreditCardUnavailableError();
  const cards = rows.filter((row) => row.card_id !== null);
  return {
    financialRevision: rows[0].financial_revision,
    items: cards.slice(0, parsed.pageSize).map(mapCard),
    hasMore: cards.length > parsed.pageSize,
  };
}

export async function getCreditCardDetailInTransaction(
  transaction: ScopedTransaction,
  input: CreditCardDetailInput,
) {
  const parsed = detailSchema.parse(input);
  const rows = await readCreditCards(transaction, {
    ...parsed,
    includeArchived: true,
    pageSize: 1,
    offset: 0,
  });
  if (!rows[0]?.card_id) throw new CreditCardUnavailableError();
  return {
    financialRevision: rows[0].financial_revision,
    card: mapCard(rows[0]),
  };
}

export async function listCreditCards(input: CreditCardListInput) {
  const parsed = listSchema.parse(input);
  return withDomainTransaction(parsed, (t) =>
    listCreditCardsInTransaction(t, parsed),
  );
}

export async function getCreditCardDetail(input: CreditCardDetailInput) {
  const parsed = detailSchema.parse(input);
  return withDomainTransaction(parsed, (t) =>
    getCreditCardDetailInTransaction(t, parsed),
  );
}
