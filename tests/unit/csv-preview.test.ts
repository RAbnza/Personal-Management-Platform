import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  cashRowFingerprint,
  confirmCsvPreview,
  csvAssumptionsSchema,
  importRowCommandId,
  previewCashCsv,
  type CsvAssumptions,
} from "@/modules/portability/domain/csv-preview";
const workspaceId = randomUUID(),
  batchId = randomUUID(),
  accountId = randomUUID();
const assumptions: CsvAssumptions = {
  sourceFormat: "pmp-cash-activity",
  formatVersion: 1,
  mapping: {
    date: "date",
    kind: "kind",
    amountMinor: "amount_minor",
    classification: "classification",
    description: "description",
    reference: "reference",
  },
  dateInterpretation: "YYYY-MM-DD",
  currency: "PHP",
  targetAccountId: accountId,
  cutoffStrategy: "after_opening",
  cutoffDate: "2026-01-01",
  earlierOpeningDate: null,
  earlierOpeningMinor: null,
};
const snapshot = {
  currency: "PHP",
  accountId,
  cutoffDate: "2026-01-01",
  openingMinor: "100000",
  accountVersion: 1,
  financialRevision: "9007199254740993",
  asOfDate: "2026-10-15",
};
const header = "date,kind,amount_minor,classification,description,reference\n";
const row = "2026-02-01,expense,12345,expense,Groceries,p1\n";
const input = (text = row) => ({
  workspaceId,
  batchId,
  bytes: Buffer.from(header + text),
  assumptions,
  snapshot,
});
const confirm = (p: ReturnType<typeof previewCashCsv>) => ({
  previewHash: p.previewHash,
  financialRevision: p.financialRevision,
  accountVersion: p.accountVersion,
  decisions: p.rows.map((r) => ({
    rowNo: r.rowNo,
    choice: "import" as const,
    acknowledgeDuplicates: false,
  })),
});
it("computes exact preview effects without floating money", () => {
  const p = previewCashCsv(
    input(row + "2026-02-02,income,20000,earned,Salary,p2\n"),
  );
  expect(p).toMatchObject({
    valid: 2,
    invalid: 0,
    expenseMinor: "12345",
    incomeMinor: "20000",
    cashDeltaMinor: "7655",
    financialRevision: "9007199254740993",
  });
  expect(confirmCsvPreview(p, confirm(p))).toHaveLength(2);
});
it.each([
  "0",
  "-1",
  "1.00",
  "1e4",
  "+10",
  "001",
  "100000000001",
  "9007199254740993",
])("rejects unsupported amount %s", (amount) => {
  expect(previewCashCsv(input(row.replace("12345", amount))).invalid).toBe(1);
});
it("preserves CSV quoting and explicit mapping", () => {
  const p = previewCashCsv(
    input('2026-02-01,expense,12345,expense,"Food, receipts",p1\n'),
  );
  expect(p.rows[0]!.normalized?.description).toBe("Food, receipts");
  expect(() =>
    previewCashCsv(input('2026-02-01,expense,12345,expense,"broken,p1\n')),
  ).toThrow("CSV_SYNTAX_INVALID");
});
it("requires explicit date interpretation for ambiguous dates", () => {
  const bytes = Buffer.from(header + row.replace("2026-02-01", "03/04/2026"));
  expect(previewCashCsv({ ...input(), bytes }).invalid).toBe(1);
  const a = previewCashCsv({
    ...input(),
    bytes,
    assumptions: { ...assumptions, dateInterpretation: "DD/MM/YYYY" },
  });
  const b = previewCashCsv({
    ...input(),
    bytes,
    assumptions: { ...assumptions, dateInterpretation: "MM/DD/YYYY" },
  });
  expect(a.rows[0]!.normalized?.effectiveDate).toBe("2026-04-03");
  expect(b.rows[0]!.normalized?.effectiveDate).toBe("2026-03-04");
  expect(a.previewHash).not.toBe(b.previewHash);
});
it.each(["2026-01-01", "2025-12-31", "2026-02-30", "2027-01-01"])(
  "does not add historical or invalid date %s to the baseline",
  (date) => {
    const p = previewCashCsv(input(row.replace("2026-02-01", date)));
    expect(p.invalid).toBe(1);
    expect(p.expenseMinor).toBe("0");
    expect(() => confirmCsvPreview(p, confirm(p))).toThrow();
  },
);
it("rejects unknown columns, duplicate headers, extra scope and invalid currency/cutoff", () => {
  expect(() =>
    previewCashCsv({
      ...input(),
      bytes: Buffer.from(header.replace("reference", "other") + row),
    }),
  ).toThrow();
  expect(() =>
    previewCashCsv({
      ...input(),
      bytes: Buffer.from(header.replace("reference", "date") + row),
    }),
  ).toThrow();
  expect(() =>
    csvAssumptionsSchema.parse({ ...assumptions, workspaceId }),
  ).toThrow();
  expect(() =>
    previewCashCsv({ ...input(), snapshot: { ...snapshot, currency: "USD" } }),
  ).toThrow();
  expect(() =>
    previewCashCsv({
      ...input(),
      snapshot: { ...snapshot, cutoffDate: "2026-01-02" },
    }),
  ).toThrow("CSV_SNAPSHOT_ASSUMPTIONS_MISMATCH");
});
it("requires complete row decisions and exact, current preview evidence", () => {
  const p = previewCashCsv(input());
  expect(() =>
    confirmCsvPreview(p, { ...confirm(p), financialRevision: "1" }),
  ).toThrow("CSV_PREVIEW_STALE");
  expect(() =>
    confirmCsvPreview(p, { ...confirm(p), accountVersion: 2 }),
  ).toThrow("CSV_PREVIEW_STALE");
  expect(() => confirmCsvPreview(p, { ...confirm(p), decisions: [] })).toThrow(
    "CSV_DECISIONS_INCOMPLETE",
  );
  expect(() =>
    confirmCsvPreview({ ...p, expenseMinor: "1" }, confirm(p)),
  ).toThrow("CSV_PREVIEW_STALE");
  expect(
    confirmCsvPreview(p, {
      ...confirm(p),
      decisions: [{ rowNo: 1, choice: "skip", acknowledgeDuplicates: false }],
    }),
  ).toHaveLength(0);
});
it("warns on matching file, row and provider reference without merging", () => {
  const p = previewCashCsv({ ...input(row + row), identicalFileSeen: true });
  expect(p.rows).toHaveLength(2);
  expect(p.rows[1]!.duplicateWarnings).toEqual([
    "MATCHING_ACTIVITY",
    "MATCHING_REFERENCE",
    "IDENTICAL_FILE",
  ]);
  expect(() => confirmCsvPreview(p, confirm(p))).toThrow(
    "CSV_ROW_NOT_CONFIRMED",
  );
  const confirmation = confirm(p);
  confirmation.decisions.forEach((d) => {
    d.acknowledgeDuplicates = true;
  });
  expect(confirmCsvPreview(p, confirmation)).toHaveLength(2);
  const existing = previewCashCsv({
    ...input(),
    existingReferences: new Set(["p1"]),
    existingFingerprints: new Set([cashRowFingerprint(p.rows[0]!.normalized!)]),
  });
  expect(existing.rows[0]!.duplicateWarnings).toEqual([
    "MATCHING_ACTIVITY",
    "MATCHING_REFERENCE",
  ]);
});
it("never accepts a rebase through an unsupported opening command", () => {
  const p = previewCashCsv({
    ...input(row.replace("2026-02-01", "2025-12-31")),
    assumptions: {
      ...assumptions,
      cutoffStrategy: "rebase_history",
      earlierOpeningDate: "2025-01-01",
      earlierOpeningMinor: "100000",
    },
  });
  expect(p.valid).toBe(1);
  expect(p.blockers).toContain("EARLIER_OPENING_COMMAND_UNAVAILABLE");
  expect(() => confirmCsvPreview(p, confirm(p))).toThrow("CSV_IMPORT_BLOCKED");
});
it("uses stable, scoped row IDs and rejects unsupported format or classification", () => {
  expect(importRowCommandId(workspaceId, batchId, 1)).toBe(
    importRowCommandId(workspaceId, batchId, 1),
  );
  expect(importRowCommandId(randomUUID(), batchId, 1)).not.toBe(
    importRowCommandId(workspaceId, batchId, 1),
  );
  expect(importRowCommandId(workspaceId, randomUUID(), 1)).not.toBe(
    importRowCommandId(workspaceId, batchId, 1),
  );
  expect(importRowCommandId(workspaceId, batchId, 2)).not.toBe(
    importRowCommandId(workspaceId, batchId, 1),
  );
  expect(() =>
    csvAssumptionsSchema.parse({ ...assumptions, sourceFormat: "bank-export" }),
  ).toThrow();
  expect(
    previewCashCsv(input(row.replace("expense,Groceries", "earned,Groceries")))
      .invalid,
  ).toBe(1);
});
it("bounds rows, bytes, record lengths and UTF-8", () => {
  expect(() => previewCashCsv(input(row.repeat(501)))).toThrow("CSV_ROW_LIMIT");
  expect(() =>
    previewCashCsv({ ...input(), bytes: Buffer.alloc(1024 * 1024 + 1) }),
  ).toThrow("CSV_SIZE_LIMIT");
  expect(() =>
    previewCashCsv({ ...input(), bytes: Buffer.from([0xff]) }),
  ).toThrow("CSV_UTF8_INVALID");
  expect(() =>
    previewCashCsv(input(row.replace("Groceries", "A".repeat(20_000)))),
  ).toThrow("CSV_SYNTAX_INVALID");
});
