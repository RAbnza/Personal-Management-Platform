import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

import {
  FINANCIAL_COMMAND_HASH_VERSION,
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "../domain/financial-command";

type CommandReceiptRow = {
  id: string;
  command_type: string;
  payload_hash_hex: string;
  hash_version: number;
  state: string;
  result_json: Record<string, unknown> | null;
};

export type ClaimFinancialCommandReceiptResult =
  | {
      kind: "claimed";
      receiptId: string;
    }
  | {
      kind: "replay";
      receiptId: string;
      result: Record<string, unknown>;
    };

export async function claimFinancialCommandReceipt(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    clientCommandId: string;
    commandType: string;
    payloadHash: Buffer;
  },
): Promise<ClaimFinancialCommandReceiptResult> {
  if (input.payloadHash.length !== 32) {
    throw new TypeError(
      "Financial command payload hashes must contain exactly 32 bytes.",
    );
  }

  const candidateReceiptId = randomUUID();

  const inserted = await transaction.db.execute<{ id: string }>(sql`
      INSERT INTO core."command_receipt" (
        "id",
        "workspace_id",
        "client_command_id",
        "command_type",
        "payload_hash",
        "hash_version"
      )
      VALUES (
        ${candidateReceiptId}::uuid,
        ${input.workspaceId}::uuid,
        ${input.clientCommandId}::uuid,
        ${input.commandType},
        ${input.payloadHash},
        ${FINANCIAL_COMMAND_HASH_VERSION}
      )
      ON CONFLICT (
        "workspace_id",
        "client_command_id"
      )
      DO NOTHING
      RETURNING "id"
    `);

  if (inserted.rows[0]) {
    return {
      kind: "claimed",
      receiptId: inserted.rows[0].id,
    };
  }

  /*
   * INSERT ... ON CONFLICT waits for a competing transaction touching the
   * same unique key. Under READ COMMITTED this following statement therefore
   * sees that transaction's committed receipt after the wait completes.
   */
  const existing = await transaction.db.execute<CommandReceiptRow>(sql`
      SELECT
        "id",
        "command_type",
        encode("payload_hash", 'hex') AS "payload_hash_hex",
        "hash_version",
        "state",
        "result_json"
      FROM core."command_receipt"
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "client_command_id" = ${input.clientCommandId}::uuid
      FOR UPDATE
    `);

  const receipt = existing.rows[0];

  if (!receipt) {
    throw new FinancialCommandStateError(
      "The existing financial command receipt could not be resolved.",
    );
  }

  const samePayload =
    receipt.command_type === input.commandType &&
    receipt.hash_version === FINANCIAL_COMMAND_HASH_VERSION &&
    receipt.payload_hash_hex === input.payloadHash.toString("hex");

  if (!samePayload) {
    throw new FinancialCommandConflictError();
  }

  if (receipt.state !== "completed" || receipt.result_json === null) {
    throw new FinancialCommandStateError(
      "An existing financial command receipt was not completed.",
    );
  }

  return {
    kind: "replay",
    receiptId: receipt.id,
    result: receipt.result_json,
  };
}

export async function completeFinancialCommandReceipt(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    receiptId: string;
    result: Record<string, unknown>;
  },
): Promise<void> {
  const serializedResult = JSON.stringify(input.result);

  const completed = await transaction.db.execute<{ id: string }>(sql`
      UPDATE core."command_receipt"
      SET
        "state" = 'completed',
        "result_json" = ${serializedResult}::jsonb,
        "completed_at" = clock_timestamp()
      WHERE
        "workspace_id" = ${input.workspaceId}::uuid
        AND "id" = ${input.receiptId}::uuid
        AND "state" = 'claimed'
      RETURNING "id"
    `);

  if (!completed.rows[0]) {
    throw new FinancialCommandStateError(
      "The financial command receipt could not be completed from its current state.",
    );
  }
}
