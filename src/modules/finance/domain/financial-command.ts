import {
  COMMAND_HASH_VERSION,
  canonicalizeCommandPayload,
  hashCommandPayload,
  type CanonicalJsonObject,
  type CanonicalJsonValue,
} from "@/modules/core/domain/command";

export const FINANCIAL_COMMAND_HASH_VERSION = COMMAND_HASH_VERSION;

export type { CanonicalJsonObject, CanonicalJsonValue };

export function canonicalizeFinancialCommandPayload(
  payload: CanonicalJsonValue,
): string {
  return canonicalizeCommandPayload(payload);
}

export function hashFinancialCommandPayload(
  payload: CanonicalJsonValue,
): Buffer {
  return hashCommandPayload(payload);
}

export class FinancialCommandConflictError extends Error {
  readonly code = "FINANCIAL_COMMAND_CONFLICT";

  constructor() {
    super(
      "The client command ID has already been used with a different financial command payload.",
    );

    this.name = "FinancialCommandConflictError";
  }
}

export class FinancialCommandStateError extends Error {
  readonly code = "FINANCIAL_COMMAND_STATE_ERROR";

  constructor(message: string) {
    super(message);

    this.name = "FinancialCommandStateError";
  }
}
