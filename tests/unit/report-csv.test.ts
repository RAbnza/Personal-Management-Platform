import { describe, expect, it } from "vitest";
import { parse } from "csv-parse/sync";
import { serializeCsv } from "@/modules/reporting/services/export-csv";
import {
  exactDecimal,
  financialDetailQuerySchema,
  reportQuerySchema,
} from "@/modules/reporting/domain/reports";
import { ReportLimitError } from "@/modules/reporting/domain/reports";
import { reportSearchParams } from "@/modules/reporting/domain/search-params";
describe("exact CSV and report contracts", () => {
  it("rejects oversized CSV before a successful response can be sent", async () => {
    await expect(
      serializeCsv([
        {
          record_type: "posting",
          description: "a".repeat(11 * 1024 * 1024),
          amount_minor: "1",
        },
      ]),
    ).rejects.toBeInstanceOf(ReportLimitError);
  });
  it("preserves large and negative money while escaping untrusted spreadsheet formulas", async () => {
    const records = [
      {
        record_type: "posting",
        description: '=HYPERLINK("evil", "quoted, text")\r\nsecond line',
        amount_minor: "-9007199254740993",
        amount_decimal: exactDecimal("-9007199254740993"),
      },
      {
        record_type: "posting",
        description: "-200",
        amount_minor: "-200",
        amount_decimal: "-2.00",
      },
      {
        record_type: "posting",
        description: "@SUM(1)",
        amount_minor: "0",
        amount_decimal: "0.00",
      },
    ];
    const csv = await serializeCsv(records),
      rows = parse(csv, { bom: true, columns: true }) as Record<
        string,
        string
      >[];
    expect(rows[0]!.description).toBe(`'${records[0]!.description}`);
    expect(rows[0]!.amount_minor).toBe("-9007199254740993");
    expect(rows[0]!.amount_decimal).toBe("-90071992547409.93");
    expect(rows[1]).toMatchObject({
      description: "'-200",
      amount_minor: "-200",
      amount_decimal: "-2.00",
    });
    expect(rows[2]!.description).toBe("'@SUM(1)");
    expect(csv.toString()).toContain("\r\n");
  });
  it("preserves UTF-8 and ordinary quoted/multiline values", async () => {
    const rows = parse(
      await serializeCsv([
        {
          name: "Rendel, “quoted”",
          notes: "First\nsecond",
          amount_minor: "123",
          amount_decimal: "1.23",
        },
      ]),
      { bom: true, columns: true },
    ) as Record<string, string>[];
    expect(rows[0]).toEqual({
      name: "Rendel, “quoted”",
      notes: "First\nsecond",
      amount_minor: "123",
      amount_decimal: "1.23",
    });
  });
  it.each(["0", "1", "99", "100", "-1", "9223372036854775807"])(
    "decimal formatting is exact for %s",
    (v) => {
      const decimal = exactDecimal(v),
        negative = v.startsWith("-");
      expect(BigInt(decimal.replace(".", ""))).toBe(BigInt(v));
      expect(decimal.startsWith("-")).toBe(negative);
    },
  );
  it("rejects duplicate and ownership parameters", () => {
    expect(() =>
      reportSearchParams(new URLSearchParams("period=week&period=year")),
    ).toThrow();
    expect(() => reportSearchParams({ period: ["week", "year"] })).toThrow();
    expect(reportQuerySchema.safeParse({ userId: "injected" }).success).toBe(
      false,
    );
    expect(
      financialDetailQuerySchema.safeParse({
        metric: "net",
        categoryId: "uncategorized",
      }).success,
    ).toBe(true);
    expect(
      financialDetailQuerySchema.safeParse({
        metric: "net",
        ledgerId: "foreign",
      }).success,
    ).toBe(false);
  });
});
