import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
// PostgreSQL UUID output is lowercase. Canonicalize accepted representations
// before hashing intent or comparing immutable provider snapshots with audit.
export const statementIdentifierSchema = z
  .uuid()
  .transform((value) => value.toLowerCase());
const date = z.string().refine(isCalendarDate, "Enter a valid calendar date.");
const amount = z
  .string()
  .max(20)
  .regex(/^(?:0|-?[1-9]\d*)$/)
  .refine((v) => {
    if (!/^(?:0|-?[1-9]\d*)$/.test(v)) return false;
    const n = BigInt(v);
    return n >= -9223372036854775808n && n <= 9223372036854775807n;
  }, "Amount exceeds the database integer range.");
const reference = z.string().trim().min(1).max(2000).nullable().default(null);
export const statementEntrySchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    postingDate: date.nullable().default(null),
    amountMinor: amount.nullable().default(null),
    providerReference: reference,
    actionRevisionId: statementIdentifierSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (e) =>
      !e.actionRevisionId || (e.postingDate !== null && e.amountMinor !== null),
    "Linked activity requires the provider amount and posting date.",
  );
export const statementEvidenceSchema = z
  .object({
    cycleStart: date,
    cycleEnd: date,
    statementDate: date,
    dueDate: date,
    balanceMinor: amount,
    minimumDueMinor: amount,
    openingBalanceMinor: amount.nullable().default(null),
    providerReference: reference,
    verificationSource: z.string().trim().min(1).max(2000),
    verifiedDate: date,
    entries: z.array(statementEntrySchema).max(100),
  })
  .strict();
export const statementCommandSchema = statementEvidenceSchema
  .extend({
    clientCommandId: statementIdentifierSchema,
    cardId: statementIdentifierSchema,
    statementId: statementIdentifierSchema.optional(),
    expectedVersion: z.number().int().min(1).max(2147483646).optional(),
    reason: z.string().trim().min(1).max(20000).optional(),
  })
  .superRefine((v, c) => {
    if (
      v.cycleStart > v.cycleEnd ||
      v.cycleEnd > v.statementDate ||
      v.statementDate > v.dueDate
    )
      c.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Cycle, statement and due dates must be in order.",
      });
    if (
      /^(?:0|-?[1-9]\d*)$/.test(v.minimumDueMinor) &&
      /^(?:0|-?[1-9]\d*)$/.test(v.balanceMinor)
    ) {
      const minimum = BigInt(v.minimumDueMinor),
        balance = BigInt(v.balanceMinor);
      if (minimum < 0n || minimum > (balance > 0n ? balance : 0n))
        c.addIssue({
          code: "custom",
          path: ["minimumDueMinor"],
          message:
            "Minimum due must be nonnegative and no greater than the positive statement balance.",
        });
    }
    if (
      Boolean(v.statementId) !== Boolean(v.expectedVersion) ||
      Boolean(v.statementId) !== Boolean(v.reason)
    )
      c.addIssue({
        code: "custom",
        path: ["reason"],
        message:
          "Corrections require a statement, expected version and reason.",
      });
    const ids = v.entries.flatMap((e) =>
      e.actionRevisionId ? [e.actionRevisionId] : [],
    );
    if (new Set(ids).size !== ids.length)
      c.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Link each recognized purchase once.",
      });
  });
export type StatementCommand = z.input<typeof statementCommandSchema>;
export type StatementEvidence = z.output<typeof statementEvidenceSchema>;
export const statementResultSchema = z.object({
  statementId: z.uuid(),
  revisionId: z.uuid(),
  version: z.number().int().positive(),
  financialRevision: z.string().regex(/^\d+$/),
});
export class StatementUnavailableError extends Error {
  constructor() {
    super("The private statement or linked activity is unavailable.");
    this.name = "StatementUnavailableError";
  }
}
export class StatementConflictError extends Error {
  constructor() {
    super(
      "Statement evidence changed or activity is already linked. Refresh before saving.",
    );
    this.name = "StatementConflictError";
  }
}
export function deriveStatementReconciliation(evidence: StatementEvidence) {
  const known = evidence.entries.reduce(
    (sum, e) => sum + (e.amountMinor === null ? 0n : BigInt(e.amountMinor)),
    0n,
  );
  const missing = evidence.entries.filter(
    (e) => e.amountMinor === null || e.postingDate === null,
  ).length;
  const balance = BigInt(evidence.balanceMinor);
  return {
    recordedRemainingDueMinor: (balance > 0n ? balance : 0n).toString(),
    effectiveAllocatedMinor: "0",
    knownProviderLinesMinor: known.toString(),
    unexplainedDifferenceMinor:
      evidence.openingBalanceMinor === null ||
      evidence.entries.some((e) => e.amountMinor === null)
        ? null
        : (balance - BigInt(evidence.openingBalanceMinor) - known).toString(),
    linkedCount: evidence.entries.filter((e) => e.actionRevisionId !== null)
      .length,
    unlinkedProviderCount: evidence.entries.filter(
      (e) => e.actionRevisionId === null,
    ).length,
    incompleteProviderCount: missing,
  };
}
