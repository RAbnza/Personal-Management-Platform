import { createHash } from "node:crypto";

export const FINANCIAL_COMMAND_HASH_VERSION = 1;

export interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue;
}

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | CanonicalJsonObject;

function isCanonicalJsonArray(
  value: CanonicalJsonValue,
): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value);
}

function serializeCanonicalJson(value: CanonicalJsonValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        "Canonical financial command numbers must be safe integers.",
      );
    }

    return JSON.stringify(value);
  }

  if (isCanonicalJsonArray(value)) {
    return `[${value.map(serializeCanonicalJson).join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      "Canonical financial command payloads must contain only plain JSON objects.",
    );
  }

  const properties = Object.keys(value)
    .sort()
    .map((key) => {
      const propertyValue = value[key];

      if (propertyValue === undefined) {
        throw new TypeError(
          "Canonical financial command payloads must not contain undefined values.",
        );
      }

      return `${JSON.stringify(key)}:${serializeCanonicalJson(propertyValue)}`;
    });

  return `{${properties.join(",")}}`;
}

export function canonicalizeFinancialCommandPayload(
  payload: CanonicalJsonValue,
): string {
  return serializeCanonicalJson(payload);
}

export function hashFinancialCommandPayload(
  payload: CanonicalJsonValue,
): Buffer {
  return createHash("sha256")
    .update(canonicalizeFinancialCommandPayload(payload), "utf8")
    .digest();
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
