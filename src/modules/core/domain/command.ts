import { createHash } from "node:crypto";

export const COMMAND_HASH_VERSION = 1;

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

export type CommandReceiptStateErrorReason =
  | "existing_receipt_unresolved"
  | "existing_receipt_incomplete"
  | "completion_invalid_state";

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
      throw new TypeError("Canonical command numbers must be safe integers.");
    }

    return JSON.stringify(value);
  }

  if (isCanonicalJsonArray(value)) {
    return `[${value.map(serializeCanonicalJson).join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      "Canonical command payloads must contain only plain JSON objects.",
    );
  }

  const properties = Object.keys(value)
    .sort()
    .map((key) => {
      const propertyValue = value[key];

      if (propertyValue === undefined) {
        throw new TypeError(
          "Canonical command payloads must not contain undefined values.",
        );
      }

      return `${JSON.stringify(key)}:${serializeCanonicalJson(propertyValue)}`;
    });

  return `{${properties.join(",")}}`;
}

export function canonicalizeCommandPayload(
  payload: CanonicalJsonValue,
): string {
  return serializeCanonicalJson(payload);
}

export function hashCommandPayload(payload: CanonicalJsonValue): Buffer {
  return createHash("sha256")
    .update(canonicalizeCommandPayload(payload), "utf8")
    .digest();
}

export class CommandReceiptConflictError extends Error {
  readonly code = "COMMAND_RECEIPT_CONFLICT";

  constructor() {
    super(
      "The client command ID has already been used with a different command payload.",
    );

    this.name = "CommandReceiptConflictError";
  }
}

export class CommandReceiptStateError extends Error {
  readonly code = "COMMAND_RECEIPT_STATE_ERROR";

  constructor(
    readonly reason: CommandReceiptStateErrorReason,
    message: string,
  ) {
    super(message);

    this.name = "CommandReceiptStateError";
  }
}
