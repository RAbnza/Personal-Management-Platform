import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";

export class SharingUnavailableError extends Error {
  constructor() {
    super("The group or record is unavailable.");
  }
}
export class SharingConflictError extends Error {
  constructor(message = "The group changed. Reload and review before saving.") {
    super(message);
  }
}
export const id = z.uuid().transform((v) => v.toLowerCase());
const name = z.string().trim().min(1).max(200);
export const minor = z
  .string()
  .max(19)
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (v) =>
      v.length <= 19 &&
      /^(0|[1-9]\d*)$/.test(v) &&
      BigInt(v) <= 9223372036854775807n,
    "Amount exceeds PostgreSQL bigint.",
  );
const positive = minor.pipe(
  z.string().refine((v) => BigInt(v) > 0n, "Amount must be positive."),
);
const command = {
  clientCommandId: id,
  groupId: id,
  expectedVersion: z.number().int().positive(),
};
export const billSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    expenseDate: z.string().refine(isCalendarDate),
    totalMinor: positive,
    splitMethod: z.enum(["equal", "exact"]),
    contributions: z
      .array(z.object({ participantId: id, amountMinor: positive }).strict())
      .min(1)
      .max(100),
    shares: z
      .array(
        z.object({ participantId: id, amountMinor: minor.optional() }).strict(),
      )
      .min(1)
      .max(100),
    categoryLabel: z.string().trim().max(200).nullable().default(null),
    notes: z.string().max(20000).nullable().default(null),
  })
  .strict();
export const groupCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      clientCommandId: id,
      groupId: id,
      name,
      displayName: name,
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal("settings"),
      name,
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({ ...command, kind: z.literal("manual"), displayName: name })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal("membership"),
      participantId: id,
      operation: z.enum(["leave", "remove", "owner", "member"]),
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal("invite"),
      email: z
        .email()
        .max(254)
        .transform((v) => v.trim().toLowerCase()),
      token: z.string().regex(/^[a-f0-9]{64}$/),
      claimParticipantId: id.nullable().default(null),
    })
    .strict(),
  z
    .object({ ...command, kind: z.literal("revoke"), invitationId: id })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal("bill"),
      bill: billSchema,
      expenseId: id.nullable().default(null),
      expectedRevisionId: id.nullable().default(null),
      reason: z.string().trim().min(1).max(2000).nullable().default(null),
    })
    .strict(),
]);
export type GroupCommand = z.infer<typeof groupCommandSchema>;
export type Bill = z.infer<typeof billSchema>;

/** Input order never controls the extra centavo. UUID order is persisted as rank. */
export function allocateBill(raw: z.input<typeof billSchema>) {
  const bill = billSchema.parse(raw);
  const compare = (
    a: { participantId: string },
    b: { participantId: string },
  ) =>
    a.participantId < b.participantId
      ? -1
      : a.participantId > b.participantId
        ? 1
        : 0;
  const payers = [...bill.contributions].sort(compare);
  const people = [...bill.shares].sort(compare);
  for (const rows of [payers, people])
    if (new Set(rows.map((x) => x.participantId)).size !== rows.length)
      throw new RangeError("A participant can appear only once on each axis.");
  const total = BigInt(bill.totalMinor),
    n = BigInt(people.length),
    q = total / n,
    r = total % n;
  const shares = people.map((p, i) => ({
    participantId: p.participantId,
    amountMinor:
      bill.splitMethod === "equal"
        ? (q + (BigInt(i) < r ? 1n : 0n)).toString()
        : minor.parse(p.amountMinor),
    roundingRank: i,
    roundingExtraMinor: bill.splitMethod === "equal" && BigInt(i) < r ? 1 : 0,
  }));
  if (
    payers.reduce((s, p) => s + BigInt(p.amountMinor), 0n) !== total ||
    shares.reduce((s, p) => s + BigInt(p.amountMinor), 0n) !== total
  )
    throw new RangeError(
      "Payer contributions and participant shares must each equal the total.",
    );
  return { ...bill, contributions: payers, shares };
}

export function sharingEnabled() {
  return (
    process.env.SHARED_EXPENSES_PREVIEW_ENABLED === "true" &&
    ["local", "test"].includes(process.env.PMP_DEPLOYMENT_ENV ?? "local")
  );
}
