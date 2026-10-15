import { hashCommandPayload } from "@/modules/core/domain/command";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

export const previewDigest = (v: unknown) =>
  hashCommandPayload(JSON.parse(JSON.stringify(v))).toString("hex");
export const CSV_MAX_BYTES = 1024 * 1024;
export const CSV_MAX_ROWS = 500;
const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const dateSchema = z.string().refine(isCalendarDate);
const column = z
  .string()
  .min(1)
  .max(100)
  .refine((s) => !/[\x00-\x1f\x7f]/.test(s));
const amount = z
  .string()
  .regex(/^[1-9]\d{0,17}$/)
  .refine(
    (s) =>
      /^[1-9]\d{0,17}$/.test(s) && BigInt(s) <= MAX_FINANCIAL_COMPONENT_MINOR,
  );
export const csvAssumptionsSchema = z
  .object({
    sourceFormat: z.literal("pmp-cash-activity"),
    formatVersion: z.literal(1),
    mapping: z
      .object({
        date: column,
        kind: column,
        amountMinor: column,
        classification: column,
        description: column,
        reference: column,
      })
      .strict(),
    dateInterpretation: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]),
    currency: z.literal("PHP"),
    targetAccountId: z.uuid(),
    cutoffStrategy: z.enum(["after_opening", "rebase_history"]),
    cutoffDate: dateSchema,
    earlierOpeningMinor: z
      .string()
      .regex(/^(0|[1-9]\d{0,17})$/)
      .refine(
        (s) =>
          /^(0|[1-9]\d{0,17})$/.test(s) &&
          BigInt(s) <= MAX_FINANCIAL_COMPONENT_MINOR,
      )
      .nullable(),
    earlierOpeningDate: dateSchema.nullable(),
  })
  .strict()
  .superRefine((a, c) => {
    if (new Set(Object.values(a.mapping)).size !== 6)
      c.addIssue({
        code: "custom",
        message: "Every mapped column must be distinct.",
      });
    if (
      a.cutoffStrategy === "after_opening" &&
      (a.earlierOpeningDate !== null || a.earlierOpeningMinor !== null)
    )
      c.addIssue({
        code: "custom",
        message: "An after-opening import cannot change its baseline.",
      });
    if (
      a.cutoffStrategy === "rebase_history" &&
      (a.earlierOpeningDate === null ||
        a.earlierOpeningMinor === null ||
        a.earlierOpeningDate >= a.cutoffDate)
    )
      c.addIssue({
        code: "custom",
        message:
          "Rebasing requires an explicit earlier opening date and amount.",
      });
  });
export type CsvAssumptions = z.input<typeof csvAssumptionsSchema>;
export const normalizedCashRowSchema = z
  .object({
    effectiveDate: dateSchema,
    kind: z.enum(["expense", "income"]),
    amountMinor: amount,
    classification: z.enum(["expense", "earned", "gift", "reward", "other"]),
    description: z.string().trim().min(1).max(2000),
    reference: z.string().trim().max(200).nullable(),
  })
  .strict()
  .refine(
    (r) =>
      r.kind === "expense"
        ? r.classification === "expense"
        : r.classification !== "expense",
    "Classification must explicitly match the transaction kind.",
  );
export type NormalizedCashRow = z.infer<typeof normalizedCashRowSchema>;
export type CsvPreviewRow = {
  rowNo: number;
  sourceRowHash: string;
  clientCommandId: string;
  normalized: NormalizedCashRow | null;
  errors: string[];
  duplicateWarnings: string[];
};
export type CsvPreview = {
  batchId: string;
  fileChecksum: string;
  assumptions: CsvAssumptions;
  financialRevision: string;
  accountVersion: number;
  openingMinor: string;
  asOfDate: string;
  rows: CsvPreviewRow[];
  valid: number;
  invalid: number;
  expenseMinor: string;
  incomeMinor: string;
  cashDeltaMinor: string;
  blockers: string[];
  previewHash: string;
};
function dateFromText(
  text: string,
  interpretation: CsvAssumptions["dateInterpretation"],
) {
  if (interpretation === "YYYY-MM-DD") return dateSchema.parse(text);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) throw new Error("Date interpretation mismatch.");
  return dateSchema.parse(
    `${m[3]}-${interpretation === "DD/MM/YYYY" ? m[2] : m[1]}-${interpretation === "DD/MM/YYYY" ? m[1] : m[2]}`,
  );
}
/** Stable within a persisted batch, scoped to an owner. Never derive identity
 * from equal amounts or from provider references alone. */
export function importRowCommandId(
  workspaceId: string,
  batchId: string,
  rowNo: number,
) {
  z.uuid().parse(workspaceId);
  z.uuid().parse(batchId);
  z.number().int().min(1).max(CSV_MAX_ROWS).parse(rowNo);
  const b = createHash("sha256")
    .update(`pmp/import/v1/${workspaceId}/${batchId}/${rowNo}`)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function cashRowFingerprint(row: NormalizedCashRow) {
  const n = normalizedCashRowSchema.parse(row);
  return sha(
    JSON.stringify([
      n.effectiveDate,
      n.kind,
      n.amountMinor,
      n.classification,
      n.description,
      n.reference,
    ]),
  );
}
/** Pure staging preview. No database insertion or financial command is
 * performed here. Existing candidates must come from an authorized snapshot. */
export function previewCashCsv(input: {
  workspaceId: string;
  batchId: string;
  bytes: Buffer;
  assumptions: CsvAssumptions;
  snapshot: {
    currency: string;
    accountId: string;
    cutoffDate: string;
    openingMinor: string;
    accountVersion: number;
    financialRevision: string;
    asOfDate: string;
  };
  existingFingerprints?: ReadonlySet<string>;
  existingReferences?: ReadonlySet<string>;
  identicalFileSeen?: boolean;
}): CsvPreview {
  const a = csvAssumptionsSchema.parse(input.assumptions);
  z.uuid().parse(input.workspaceId);
  z.uuid().parse(input.batchId);
  const s = z
    .object({
      currency: z.literal("PHP"),
      accountId: z.uuid(),
      cutoffDate: dateSchema,
      openingMinor: z.string().regex(/^-?(0|[1-9]\d{0,17})$/),
      accountVersion: z.number().int().positive(),
      financialRevision: z.string().regex(/^\d+$/),
      asOfDate: dateSchema,
    })
    .strict()
    .parse(input.snapshot);
  if (
    a.targetAccountId !== s.accountId ||
    a.currency !== s.currency ||
    a.cutoffDate !== s.cutoffDate
  )
    throw new Error("CSV_SNAPSHOT_ASSUMPTIONS_MISMATCH");
  if (input.bytes.length < 1 || input.bytes.length > CSV_MAX_BYTES)
    throw new Error("CSV_SIZE_LIMIT");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    throw new Error("CSV_UTF8_INVALID");
  }
  if (text.includes("\0")) throw new Error("CSV_CONTENT_INVALID");
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 16 * 1024,
      to: CSV_MAX_ROWS + 2,
      relax_column_count: false,
    });
  } catch {
    throw new Error("CSV_SYNTAX_INVALID");
  }
  const [header, ...data] = records;
  if (!header || data.length < 1 || data.length > CSV_MAX_ROWS)
    throw new Error("CSV_ROW_LIMIT");
  if (
    header.length !== 6 ||
    new Set(header).size !== 6 ||
    Object.values(a.mapping).some((name) => !header.includes(name))
  )
    throw new Error("CSV_COLUMNS_UNSUPPORTED");
  const index = Object.fromEntries(
    Object.entries(a.mapping).map(([k, v]) => [k, header.indexOf(v)]),
  ) as Record<keyof CsvAssumptions["mapping"], number>;
  const seen = new Set<string>();
  const seenReferences = new Set<string>();
  let expense = 0n;
  let income = 0n;
  const rows: CsvPreviewRow[] = data.map((cells, i) => {
    const rowNo = i + 1;
    const errors: string[] = [];
    const duplicateWarnings: string[] = [];
    let normalized: NormalizedCashRow | null = null;
    try {
      normalized = normalizedCashRowSchema.parse({
        effectiveDate: dateFromText(cells[index.date]!, a.dateInterpretation),
        kind: cells[index.kind],
        amountMinor: cells[index.amountMinor],
        classification: cells[index.classification],
        description: cells[index.description],
        reference: cells[index.reference]!.trim() || null,
      });
      const cutoff =
        a.cutoffStrategy === "after_opening"
          ? a.cutoffDate
          : a.earlierOpeningDate!;
      if (normalized.effectiveDate <= cutoff)
        errors.push("DATE_NOT_AFTER_CONFIRMED_OPENING");
      if (normalized.effectiveDate > s.asOfDate)
        errors.push("FUTURE_ACTIVITY_NOT_SUPPORTED");
      const fp = cashRowFingerprint(normalized);
      if (seen.has(fp) || input.existingFingerprints?.has(fp))
        duplicateWarnings.push("MATCHING_ACTIVITY");
      if (
        normalized.reference &&
        (seenReferences.has(normalized.reference) ||
          input.existingReferences?.has(normalized.reference))
      )
        duplicateWarnings.push("MATCHING_REFERENCE");
      if (input.identicalFileSeen) duplicateWarnings.push("IDENTICAL_FILE");
      seen.add(fp);
      if (normalized.reference) seenReferences.add(normalized.reference);
      if (!errors.length) {
        if (normalized.kind === "expense")
          expense += BigInt(normalized.amountMinor);
        else income += BigInt(normalized.amountMinor);
      }
    } catch {
      errors.push("ROW_MAPPING_OR_VALUE_INVALID");
    }
    return {
      rowNo,
      sourceRowHash: sha(JSON.stringify(cells)),
      clientCommandId: importRowCommandId(
        input.workspaceId,
        input.batchId,
        rowNo,
      ),
      normalized,
      errors,
      duplicateWarnings,
    };
  });
  const unsigned = {
    batchId: input.batchId,
    fileChecksum: sha(input.bytes),
    assumptions: a,
    financialRevision: s.financialRevision,
    accountVersion: s.accountVersion,
    openingMinor: s.openingMinor,
    asOfDate: s.asOfDate,
    rows,
    valid: rows.filter((r) => !r.errors.length).length,
    invalid: rows.filter((r) => r.errors.length).length,
    expenseMinor: expense.toString(),
    incomeMinor: income.toString(),
    cashDeltaMinor: (income - expense).toString(),
    blockers:
      a.cutoffStrategy === "rebase_history"
        ? ["EARLIER_OPENING_COMMAND_UNAVAILABLE"]
        : [],
  };
  return { ...unsigned, previewHash: previewDigest(unsigned) };
}

export function confirmCsvPreview(
  preview: CsvPreview,
  confirmation: {
    previewHash: string;
    financialRevision: string;
    accountVersion: number;
    decisions: {
      rowNo: number;
      choice: "import" | "skip";
      acknowledgeDuplicates: boolean;
    }[];
  },
) {
  const { previewHash, ...unsigned } = preview;
  if (
    previewDigest(unsigned) !== previewHash ||
    confirmation.previewHash !== previewHash ||
    confirmation.financialRevision !== preview.financialRevision ||
    confirmation.accountVersion !== preview.accountVersion
  )
    throw new Error("CSV_PREVIEW_STALE");
  if (preview.blockers.length) throw new Error("CSV_IMPORT_BLOCKED");
  const c = z
    .object({
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      financialRevision: z.string().regex(/^\d+$/),
      accountVersion: z.number().int().positive(),
      decisions: z
        .array(
          z
            .object({
              rowNo: z.number().int().positive(),
              choice: z.enum(["import", "skip"]),
              acknowledgeDuplicates: z.boolean(),
            })
            .strict(),
        )
        .max(CSV_MAX_ROWS),
    })
    .strict()
    .parse(confirmation);
  if (
    c.decisions.length !== preview.rows.length ||
    new Set(c.decisions.map((d) => d.rowNo)).size !== preview.rows.length
  )
    throw new Error("CSV_DECISIONS_INCOMPLETE");
  return preview.rows.filter((row) => {
    const d = c.decisions.find((decision) => decision.rowNo === row.rowNo);
    if (!d) throw new Error("CSV_DECISIONS_INCOMPLETE");
    if (
      d.choice === "import" &&
      (row.errors.length ||
        !row.normalized ||
        (row.duplicateWarnings.length && !d.acknowledgeDuplicates))
    )
      throw new Error("CSV_ROW_NOT_CONFIRMED");
    return d.choice === "import";
  });
}
