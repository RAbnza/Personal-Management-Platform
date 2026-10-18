import { describe, expect, it } from "vitest";
import { inspectCashCsv } from "@/components/portability/csv-columns";

describe("cash import column inspection", () => {
  it("retains quoted headers, multiline samples and exact amount strings", () => {
    const r = inspectCashCsv(
      '\uFEFFWhen,Type,Centavos,Class,"Memo, title",Ref\r\n2026-10-18,expense,9007199254740993,expense,"First line\nSecond line",x\r\n',
    );
    expect(r.columns).toEqual([
      "When",
      "Type",
      "Centavos",
      "Class",
      "Memo, title",
      "Ref",
    ]);
    expect(r.sample[2]).toBe("9007199254740993");
    expect(r.sample[4]).toBe("First line\nSecond line");
    expect(r.count).toBe(1);
  });
  it("rejects duplicate columns, unsupported extra columns, malformed rows and overflow", () => {
    expect(() => inspectCashCsv("a,b,c,d,e,e\n1,2,3,4,5,6")).toThrow();
    expect(() => inspectCashCsv("a,b,c,d,e,f,g\n1,2,3,4,5,6,7")).toThrow();
    expect(() => inspectCashCsv("a,b,c,d,e,f\n1,2,3")).toThrow();
    expect(() =>
      inspectCashCsv("a,b,c,d,e,f\n" + "1,2,3,4,5,6\n".repeat(501)),
    ).toThrow();
    expect(() => inspectCashCsv("x".repeat(1048577))).toThrow();
  });
});
