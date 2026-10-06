import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { ScopedTransaction } from "@/platform/db";

import {
  COMMAND_HASH_VERSION,
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "../domain/command";

type CommandReceiptRow = {
  id: string;
  command_type: string;
  payload_hash_hex: string;
  hash_version: number;
  state: string;
  result_json: Record<string, unknown> | null;
};

export type ClaimCommandReceiptResult =
  | {
      kind: "claimed";
      receiptId: string;
    }
  | {
      kind: "replay";
      receiptId: string;
      result: Record<string, unknown>;
    };

export async function claimCommandReceipt(
  transaction: ScopedTransaction,
  input: {
    workspaceId: string;
    clientCommandId: string;
    commandType: string;
    payloadHash: Buffer;
  },
): Promise<ClaimCommandReceiptResult> {
  if (input.payloadHash.length !== 32) {
    throw new TypeError(
      "Command payload hashes must contain exactly 32 bytes.",
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
      ${COMMAND_HASH_VERSION}
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
    throw new CommandReceiptStateError(
      "existing_receipt_unresolved",
      "The existing command receipt could not be resolved.",
    );
  }

  const samePayload =
    receipt.command_type === input.commandType &&
    receipt.hash_version === COMMAND_HASH_VERSION &&
    receipt.payload_hash_hex === input.payloadHash.toString("hex");

  if (!samePayload) {
    throw new CommandReceiptConflictError();
  }

  if (receipt.state !== "completed" || receipt.result_json === null) {
    throw new CommandReceiptStateError(
      "existing_receipt_incomplete",
      "An existing command receipt was not completed.",
    );
  }

  return {
    kind: "replay",
    receiptId: receipt.id,
    result: receipt.result_json,
  };
}

export async function completeCommandReceipt(
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
    throw new CommandReceiptStateError(
      "completion_invalid_state",
      "The command receipt could not be completed from its current state.",
    );
  }
}
