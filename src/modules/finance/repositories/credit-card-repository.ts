import { and, eq, sql } from "drizzle-orm";

import type { CreditCardMetadata } from "@/modules/finance/domain/credit-card";
import type { ScopedTransaction } from "@/platform/db";
import { creditCard, ledgerAccount } from "@/platform/db/schema";

export async function readCreditCardIdentity(
  transaction: ScopedTransaction,
  input: { workspaceId: string; cardId: string },
) {
  const [row] = await transaction.db
    .select({ ledgerId: creditCard.liabilityLedgerAccountId })
    .from(creditCard)
    .where(
      and(
        eq(creditCard.workspaceId, input.workspaceId),
        eq(creditCard.id, input.cardId),
      ),
    );
  return row ?? null;
}

export async function insertCreditCard(
  transaction: ScopedTransaction,
  input: CreditCardMetadata & {
    id: string;
    workspaceId: string;
    liabilityLedgerAccountId: string;
    currency: string;
    userId: string;
    requestId: string | null;
  },
) {
  await transaction.db.insert(ledgerAccount).values({
    id: input.liabilityLedgerAccountId,
    workspaceId: input.workspaceId,
    code: `card-liability:${input.id}`,
    name: input.name,
    kind: "card_liability",
    currency: input.currency,
  });
  await transaction.db.insert(creditCard).values({
    id: input.id,
    workspaceId: input.workspaceId,
    liabilityLedgerAccountId: input.liabilityLedgerAccountId,
    currency: input.currency,
    name: input.name,
    issuerName: input.issuerName,
    creditLimitMinor:
      input.creditLimitMinor === null ? null : BigInt(input.creditLimitMinor),
    limitVerifiedDate: input.limitVerifiedDate,
    notes: input.notes,
    recordedByUserId: input.userId,
    actorKind: "user",
    requestId: input.requestId,
  });
}

export async function updateCreditCardMetadata(
  transaction: ScopedTransaction,
  input: CreditCardMetadata & {
    workspaceId: string;
    cardId: string;
    expectedVersion: number;
    archived: boolean;
  },
) {
  const rows = await transaction.db
    .update(creditCard)
    .set({
      name: input.name,
      issuerName: input.issuerName,
      creditLimitMinor:
        input.creditLimitMinor === null ? null : BigInt(input.creditLimitMinor),
      limitVerifiedDate: input.limitVerifiedDate,
      notes: input.notes,
      // Preserve the first archive instant on a metadata edit of an archived card.
      archivedAt: input.archived
        ? sql`COALESCE(${creditCard.archivedAt}, clock_timestamp())`
        : null,
    })
    .where(
      and(
        eq(creditCard.workspaceId, input.workspaceId),
        eq(creditCard.id, input.cardId),
        eq(creditCard.version, input.expectedVersion),
      ),
    )
    .returning({ version: creditCard.version });
  return rows[0] ?? null;
}

export type CreditCardQueryRow = {
  financial_revision: string;
  card_id: string | null;
  liability_ledger_account_id: string | null;
  name: string | null;
  issuer_name: string | null;
  currency: string | null;
  credit_limit_minor: string | null;
  limit_verified_date: string | null;
  notes: string | null;
  archived: boolean;
  version: number | null;
  signed_ledger_minor: string;
};

export async function readCreditCards(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    cardId: string | null;
    includeArchived: boolean;
    pageSize: number;
    offset: number;
  },
): Promise<CreditCardQueryRow[]> {
  const result = await transaction.db.execute<CreditCardQueryRow>(sql`
    WITH header AS (
      SELECT w.id, w.financial_revision::text AS financial_revision
      FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
      WHERE w.id=${input.workspaceId}::uuid AND w.state='active' AND u.lifecycle='active'
    ), selected_cards AS (
      SELECT c.* FROM finance.credit_card c JOIN header h ON h.id=c.workspace_id
      WHERE (${input.includeArchived} OR c.archived_at IS NULL)
        AND (${input.cardId}::uuid IS NULL OR c.id=${input.cardId}::uuid)
      ORDER BY c.name,c.id LIMIT ${input.pageSize} OFFSET ${input.offset}
    ), balances AS (
      SELECT p.ledger_account_id, sum(p.amount_minor::numeric)::text AS signed_ledger_minor
      FROM selected_cards c
      JOIN finance.posting p ON p.workspace_id=c.workspace_id AND p.ledger_account_id=c.liability_ledger_account_id
      JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.action_revision_id=p.action_revision_id
        AND j.id=p.journal_id AND j.state='posted'
      JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
      GROUP BY p.ledger_account_id
    )
    SELECT h.financial_revision,c.id AS card_id,c.liability_ledger_account_id,c.name,c.issuer_name,c.currency,
      c.credit_limit_minor::text,c.limit_verified_date::text,c.notes,c.archived_at IS NOT NULL AS archived,
      c.version,COALESCE(b.signed_ledger_minor,'0') AS signed_ledger_minor
    FROM header h LEFT JOIN selected_cards c ON c.workspace_id=h.id
    LEFT JOIN balances b ON b.ledger_account_id=c.liability_ledger_account_id
    ORDER BY c.name,c.id
  `);
  return result.rows;
}
