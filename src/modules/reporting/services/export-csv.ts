import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { stringify } from "csv-stringify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { lockActivePrivateWorkspace } from "@/modules/core/repositories/private-domain-write-repository";
import {
  claimCommandReceipt,
  completeCommandReceipt,
} from "@/modules/core/repositories/command-receipt-repository";
import { hashCommandPayload } from "@/modules/core/domain/command";
import {
  reportQuerySchema,
  financialMetrics,
  exactDecimal,
  ReportLimitError,
  CAREER_COVERAGE_NOTE,
} from "../domain/reports";
import {
  readExportRows,
  type ExportKind,
  type ExportRow,
} from "../repositories/export-repository";
import {
  resolveReport,
  getFinancialReportInTransaction,
  getCareerReportInTransaction,
  readReportCoverage,
} from "./get-reports";
export const exportKindSchema = z.enum([
  "transactions",
  "debt-schedules",
  "debt-payments",
  "applications",
  "report",
]);
export const CSV_SCHEMA_VERSION = 1;
export const EXPORT_BYTE_LIMIT = 10 * 1024 * 1024;
export async function prepareCsvSnapshotInTransaction(
  t: ScopedTransaction,
  input: {
    workspaceId: string;
    kind: ExportKind;
    query: z.input<typeof reportQuerySchema>;
  },
) {
  const kind = exportKindSchema.parse(input.kind),
    context = await resolveReport(t, input.workspaceId, input.query);
  let rows: ExportRow[];
  if (kind === "report") {
    const financial = await getFinancialReportInTransaction(t, {
        workspaceId: input.workspaceId,
        query: input.query,
      }),
      career = await getCareerReportInTransaction(t, {
        workspaceId: input.workspaceId,
        query: input.query,
      });
    rows = Object.entries(financial.metrics).map(([metric, amount]) => ({
      record_type: "financial_metric",
      metric,
      label: financialMetrics[metric as keyof typeof financialMetrics],
      amount_minor: amount,
      amount_decimal: exactDecimal(amount),
    }));
    rows.push({
      record_type: "scheduled_payable",
      metric: "current_schedule_remaining",
      amount_minor: financial.scheduledMinor,
      amount_decimal: exactDecimal(financial.scheduledMinor),
      label:
        "Current schedule allocations for selected due dates; not historical schedule reconstruction",
    });
    for (const [metric, value] of Object.entries(career.summary))
      if (typeof value === "number")
        rows.push({
          record_type: "career_metric",
          metric,
          count_value: String(value),
        });
    rows.push({
      record_type: "career_rate",
      metric: "response_rate",
      numerator: career.summary.responseRate?.numerator ?? null,
      denominator: career.summary.responseRate?.denominator ?? null,
      label:
        "Explicit response events / submitted-date cohort; blank denominator is not applicable",
    });
  } else
    rows = await readExportRows(
      t,
      input.workspaceId,
      context.period,
      kind,
      context.asOfDate,
    );
  if (rows.length > 10000) throw new ReportLimitError();
  const coverage = await readReportCoverage(
    t,
    input.workspaceId,
    context.period,
  );
  return {
    context,
    kind,
    rows,
    coverage: {
      ...coverage,
      ...(kind === "report" || kind === "applications"
        ? { careerNote: CAREER_COVERAGE_NOTE }
        : {}),
    },
  };
}
/** Formula escaping is enabled for untrusted text. Only schema-designated,
 * validated exact numeric columns bypass it: negative money must remain exact. */
export async function serializeCsv(records: ExportRow[]) {
  const columns = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
  const output = Readable.from(records).pipe(
    stringify({
      header: true,
      columns,
      bom: true,
      record_delimiter: "windows",
      escape_formulas: true,
      cast: {
        string(value, context) {
          const key = String(context.column);
          if (
            (key.endsWith("_minor") ||
              key.endsWith("_decimal") ||
              [
                "count_value",
                "numerator",
                "denominator",
                "row_count",
                "financial_revision",
                "schema_version",
                "source_version",
                "revision_no",
                "version_no",
              ].includes(key)) &&
            /^-?\d+(?:\.\d{2})?$/.test(value)
          )
            return { value, escape_formulas: false };
          return value;
        },
      },
    }),
  );
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of output) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > EXPORT_BYTE_LIMIT) {
      output.destroy();
      throw new ReportLimitError();
    }
    parts.push(part);
  }
  return Buffer.concat(parts);
}
export async function recordExportProvenanceInTransaction(
  t: ScopedTransaction,
  input: {
    userId: string;
    workspaceId: string;
    exportRunId: string;
    snapshot: Awaited<ReturnType<typeof prepareCsvSnapshotInTransaction>>;
  },
) {
  await lockActivePrivateWorkspace(t, input);
  const s = input.snapshot,
    clientCommandId = randomUUID(),
    intent = {
      exportKind: s.kind,
      definitionVersion: s.context.definitionVersion,
      scope: "all_owned_records",
      period: s.context.period,
      asOfDate: s.context.asOfDate,
    };
  const receipt = await claimCommandReceipt(t, {
    workspaceId: input.workspaceId,
    clientCommandId,
    commandType: "reporting.export_csv",
    payloadHash: hashCommandPayload(intent),
  });
  if (receipt.kind !== "claimed")
    throw new Error("Unexpected export command replay");
  await t.db.execute(
    sql`DELETE FROM ops.export_run WHERE workspace_id=${input.workspaceId}::uuid AND created_at<transaction_timestamp()-interval '30 days'`,
  );
  await t.db
    .execute(sql`INSERT INTO ops.export_run(id,workspace_id,export_kind,schema_version,filters_json,requested_by_user_id,command_receipt_id,state,snapshot_financial_revision,generated_at,row_count,coverage_json)
    VALUES(${input.exportRunId}::uuid,${input.workspaceId}::uuid,${s.kind === "debt-schedules" || s.kind === "debt-payments" ? "debts" : s.kind},${CSV_SCHEMA_VERSION},${JSON.stringify(intent)}::jsonb,${input.userId}::uuid,${receipt.receiptId}::uuid,'completed',${s.context.financialRevision}::bigint,${s.context.generatedAt}::timestamptz,${s.rows.length}::bigint,${JSON.stringify(s.coverage)}::jsonb)`);
  await completeCommandReceipt(t, {
    workspaceId: input.workspaceId,
    receiptId: receipt.receiptId,
    result: { exportRunId: input.exportRunId },
  });
  return input.exportRunId;
}
export async function prepareCsvExport(input: {
  userId: string;
  workspaceId: string;
  kind: ExportKind;
  query: z.input<typeof reportQuerySchema>;
}) {
  const started = Date.now();
  const snapshot = await withDomainTransaction(
    input,
    (t) => prepareCsvSnapshotInTransaction(t, input),
    { readOnlySnapshot: true },
  );
  const exportRunId = randomUUID(),
    c = snapshot.context;
  const metadata: ExportRow = {
    record_type: "manifest",
    export_run_id: exportRunId,
    export_kind: snapshot.kind,
    schema_version: String(CSV_SCHEMA_VERSION),
    definition_version: c.definitionVersion,
    period_start: c.period.startDate,
    period_end_inclusive: c.period.endDate,
    period_end_exclusive: c.period.endDateExclusive,
    as_of_date: c.asOfDate,
    date_basis:
      snapshot.kind === "debt-schedules"
        ? "due_date_all_finalized_versions"
        : snapshot.kind === "applications"
          ? "submitted_date_cohort_stage_effective_date_and_current_known_event_versions"
          : snapshot.kind === "report"
            ? "financial_effective_date; career_aggregates_use_submitted_date_cohort_and_event_date"
            : "financial_effective_date",
    currency: c.currency,
    timezone: c.timezone,
    generated_at: c.generatedAt,
    financial_revision: c.financialRevision,
    row_count: String(snapshot.rows.length),
    coverage_json: JSON.stringify(snapshot.coverage),
    filters_json: JSON.stringify(c.filters),
    scope:
      "Owner-scoped V1 record/report CSV; not a complete workspace backup. Historical revisions must not be summed as additional business actions.",
    text_sanitization:
      "Formula-leading untrusted text is apostrophe-prefixed; exact numeric monetary columns are unchanged. Minor units are integer centavos; decimal amounts have two places. History window: 30 days; expired provenance is pruned on the next prepared export.",
  };
  const rows = snapshot.rows.map((row) => ({ ...metadata, ...row })),
    buffer = await serializeCsv([metadata, ...rows]);
  if (Date.now() - started > 30000) throw new ReportLimitError();
  await withDomainTransaction(input, (t) =>
    recordExportProvenanceInTransaction(t, { ...input, exportRunId, snapshot }),
  );
  return {
    buffer,
    exportRunId,
    filename: `pmp-${snapshot.kind}-${c.period.startDate}-${c.period.endDate}-${exportRunId}.csv`,
    rowCount: snapshot.rows.length,
  };
}
