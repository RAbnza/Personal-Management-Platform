import { parse } from "csv-parse/browser/esm/sync";
export function inspectCashCsv(text: string) {
  if (
    !text ||
    new TextEncoder().encode(text).length > 1048576 ||
    text.includes("\0")
  )
    throw new Error("Choose a UTF-8 CSV up to 1 MiB.");
  const rows = parse(text, {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 16384,
    to: 502,
    relax_column_count: false,
  }) as string[][];
  const [columns, ...records] = rows;
  if (
    !columns ||
    columns.length !== 6 ||
    new Set(columns).size !== 6 ||
    columns.some((c) => !c || c.length > 100 || /[\x00-\x1f\x7f]/.test(c))
  )
    throw new Error(
      "This cash import requires exactly six distinct column names.",
    );
  if (!records.length || records.length > 500)
    throw new Error("Choose between 1 and 500 cash rows.");
  return { columns, sample: records[0]!, count: records.length };
}
export const cashColumnDefaults = {
  date: "date",
  kind: "kind",
  amountMinor: "amount_minor",
  classification: "classification",
  description: "description",
  reference: "reference",
};
