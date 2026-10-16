import { describe, it, expect, afterEach } from "vitest";
import {
  definitionSchema,
  validateValues,
  migrateValues,
  trackerCommandSchema,
  civilDate,
  scaled,
  type Definition,
} from "@/modules/trackers/domain/tracker";
import { presets } from "@/modules/trackers/domain/presets";
import { trackersEnabled } from "@/modules/trackers/feature";
const clone = (d: Definition): Definition => structuredClone(d);
describe("version-aware private tracker validation", () => {
  it.each(Object.entries(presets))(
    "validates source-controlled %s preset and defaults",
    (_key, d) => {
      expect(definitionSchema.parse(d)).toEqual(d);
      const result = validateValues(d, { [d.titleKey]: "Example" });
      expect(result.title).toBe("Example");
      expect(result.completed).toBe(false);
    },
  );
  it.each([
    "2026-02-29",
    "2026-13-01",
    "2026-01-32",
    "2026-10-16T00:00:00Z",
    "0000-01-01",
  ])("rejects invalid civil date %s", (date) =>
    expect(civilDate.safeParse(date).success).toBe(false),
  );
  it("retains leap and ordinary civil dates without timezone coercion", () => {
    expect(civilDate.parse("2028-02-29")).toBe("2028-02-29");
    expect(
      validateValues(presets.tasks, { title: "Call", due: "2026-10-16" })
        .deadline,
    ).toBe("2026-10-16");
  });
  it("checks required, unknown, option membership and retired fields", () => {
    expect(() => validateValues(presets.learning, {})).toThrow("Required");
    expect(() =>
      validateValues(presets.learning, { topic: "A", status: "invented" }),
    ).toThrow("active option");
    expect(() =>
      validateValues(presets.books, { title: "A", sql: "DROP TABLE" }),
    ).toThrow("Unknown");
  });
  it.each(["NaN", "Infinity", "1e3", "0001", "1.12345", "1000000000000"])(
    "rejects unsafe number format %s",
    (rating) =>
      expect(() =>
        validateValues(presets.books, { title: "A", rating }),
      ).toThrow(),
  );
  it("compares decimals exactly and rejects financial-style numeric payloads", () => {
    expect(scaled("-0.0001")).toBe(-1n);
    expect(scaled("999999999999.9999")).toBe(9999999999999999n);
    expect(() =>
      validateValues(presets.books, { title: "A", rating: "5.0001" }),
    ).toThrow();
    expect(() =>
      validateValues(presets.books, { title: "A", rating: 5 }),
    ).toThrow();
  });
  it("validates checkbox values and computes completion from mapped fields", () => {
    expect(
      validateValues(presets.books, { title: "A", finished: true }).completed,
    ).toBe(true);
    expect(() =>
      validateValues(presets.books, { title: "A", finished: "true" }),
    ).toThrow();
    expect(
      validateValues(presets.tasks, { title: "A", status: "completed" })
        .completed,
    ).toBe(true);
  });
  it("rejects executable definition keys, wrong mappings, unknown validation and invalid defaults", () => {
    expect(
      definitionSchema.safeParse({ ...presets.tasks, script: "eval()" })
        .success,
    ).toBe(false);
    expect(
      definitionSchema.safeParse({ ...presets.tasks, deadlineKey: "title" })
        .success,
    ).toBe(false);
    const d = clone(presets.books);
    d.fields[2]!.validation = { min: "garbage" };
    expect(definitionSchema.safeParse(d).success).toBe(false);
    d.fields[2]!.validation = { min: "0", max: "5" };
    d.fields[2]!.default = "6";
    expect(definitionSchema.safeParse(d).success).toBe(false);
    expect(
      definitionSchema.safeParse({
        ...presets.tasks,
        fields: presets.tasks.fields.map((f) => ({
          ...f,
          validation: { formula: "1+1" },
        })),
      }).success,
    ).toBe(false);
  });
  it("bounds definitions, title, values and option identities", () => {
    expect(() =>
      validateValues(presets.books, { title: "x".repeat(201) }),
    ).toThrow("200");
    expect(() =>
      validateValues(presets.books, { title: "A", author: "x".repeat(4001) }),
    ).toThrow();
    const d = clone(presets.tasks);
    d.fields[1]!.options.push(d.fields[1]!.options[0]!);
    expect(definitionSchema.safeParse(d).success).toBe(false);
    expect(
      definitionSchema.safeParse({ ...d, fields: Array(31).fill(d.fields[0]) })
        .success,
    ).toBe(false);
  });
  it("requires explicit conversion and retains input evidence", () => {
    const from = clone(presets.learning),
      to = clone(from);
    to.fields.find((f) => f.key === "technology")!.type = "number";
    const old = { topic: "SQL", technology: "12.5000" };
    expect(() => migrateValues(from, to, old, {})).toThrow("explicit");
    expect(
      migrateValues(from, to, old, {
        technology: { from: "technology", conversion: "text_to_number" },
      }).values.technology,
    ).toBe("12.5000");
    expect(old.technology).toBe("12.5000");
  });
  it("reviews defaults and explicit select remapping", () => {
    const from = clone(presets.tasks),
      to = clone(from);
    to.fields
      .find((f) => f.key === "status")!
      .options.find((o) => o.key === "active")!.retired = true;
    expect(() =>
      migrateValues(from, to, { title: "A", status: "active" }, {}),
    ).toThrow();
    expect(
      migrateValues(
        from,
        to,
        { title: "A", status: "active" },
        {
          status: {
            from: "status",
            conversion: "copy",
            optionMap: { active: "planned" },
          },
        },
      ).values.status,
    ).toBe("planned");
  });
  it("rejects unknown command fields and client ownership", () => {
    expect(
      trackerCommandSchema.safeParse({
        operation: "preset",
        clientCommandId: crypto.randomUUID(),
        preset: "books",
        name: "Books",
        workspaceId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
describe("completed domain gate", () => {
  const old = { ...process.env };
  afterEach(() => {
    process.env = old;
  });
  it.each(["test", "staging", "production"])(
    "enables the completed domain in %s",
    (env) => {
      process.env.PMP_DEPLOYMENT_ENV = env;
      delete process.env.TRACKERS_ENABLED;
      expect(trackersEnabled()).toBe(true);
    },
  );
  it("allows an explicit operational disable", () => {
    process.env.TRACKERS_ENABLED = "false";
    expect(trackersEnabled()).toBe(false);
  });
});
