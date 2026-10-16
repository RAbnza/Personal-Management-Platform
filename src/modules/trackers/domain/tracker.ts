import { z } from "zod";

export const trackerId = z.uuid();
export const fieldKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const label = z.string().trim().min(1).max(120);
export const decimal = z
  .string()
  .regex(
    /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/,
    "Use a decimal with at most 12 whole and 4 fractional digits.",
  );
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      s >= "1900-01-01" &&
      s <= "9999-12-31" &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Use a real calendar date (1900–9999).",
  );
export const scalar = z.union([z.string().max(4000), z.boolean(), z.null()]);
export type Value = z.infer<typeof scalar>;
export const valuesSchema = z
  .record(fieldKey, scalar)
  .refine(
    (v) => JSON.stringify(v).length <= 16000,
    "Entry values exceed 16,000 characters.",
  );
const rules = z
  .object({
    minLength: z.number().int().min(0).max(4000).optional(),
    maxLength: z.number().int().min(1).max(4000).optional(),
    min: decimal.optional(),
    max: decimal.optional(),
    earliest: civilDate.optional(),
    latest: civilDate.optional(),
  })
  .strict();
export const fieldSchema = z
  .object({
    key: fieldKey,
    label,
    type: z.enum(["text", "number", "date", "checkbox", "single_select"]),
    required: z.boolean(),
    retired: z.boolean().default(false),
    validation: rules.default({}),
    default: scalar.optional(),
    options: z
      .array(
        z
          .object({ key: fieldKey, label, retired: z.boolean().default(false) })
          .strict(),
      )
      .max(40)
      .default([]),
  })
  .strict();
export const definitionSchema = z
  .object({
    name: label,
    fields: z.array(fieldSchema).min(1).max(30),
    titleKey: fieldKey,
    statusKey: fieldKey.nullable(),
    deadlineKey: fieldKey.nullable(),
    completionKey: fieldKey.nullable().default(null),
    completedStatusKeys: z.array(fieldKey).max(40).default([]),
  })
  .strict()
  .superRefine((d, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(d.fields.map((f) => f.key)).size !== d.fields.length)
      fail("Field keys must be unique.");
    const mapped = (key: string | null, type: string) =>
      key === null ||
      d.fields.some((f) => f.key === key && f.type === type && !f.retired);
    if (
      !mapped(d.titleKey, "text") ||
      !d.fields.find((f) => f.key === d.titleKey)?.required
    )
      fail("Choose an active required text title.");
    const titleDefault = d.fields.find((f) => f.key === d.titleKey)?.default;
    if (typeof titleDefault === "string" && titleDefault.length > 200)
      fail("Title defaults must be at most 200 characters.");
    if (
      !mapped(d.statusKey, "single_select") ||
      !mapped(d.deadlineKey, "date") ||
      !mapped(d.completionKey, "checkbox")
    )
      fail("Status, deadline and completion mappings have incompatible types.");
    const status = d.fields.find((f) => f.key === d.statusKey);
    if (
      d.completedStatusKeys.some(
        (k) => !status?.options.some((o) => o.key === k && !o.retired),
      )
    )
      fail("Completed statuses must be active status options.");
    for (const f of d.fields) {
      if (new Set(f.options.map((o) => o.key)).size !== f.options.length)
        fail(`${f.label}: option keys must be unique.`);
      const allowed =
        f.type === "text"
          ? ["minLength", "maxLength"]
          : f.type === "number"
            ? ["min", "max"]
            : f.type === "date"
              ? ["earliest", "latest"]
              : [];
      if (Object.keys(f.validation).some((k) => !allowed.includes(k)))
        fail(`${f.label}: unsupported validation for this field type.`);
      if (f.type !== "single_select" && f.options.length)
        fail(`${f.label}: only select fields have options.`);
      if (
        f.type === "single_select" &&
        !f.retired &&
        !f.options.some((o) => !o.retired)
      )
        fail(`${f.label}: add an active option.`);
      const r = f.validation;
      if (
        (r.minLength ?? 0) > (r.maxLength ?? 4000) ||
        (r.min &&
          r.max &&
          decimal.safeParse(r.min).success &&
          decimal.safeParse(r.max).success &&
          scaled(r.min) > scaled(r.max)) ||
        (r.earliest && r.latest && r.earliest > r.latest)
      )
        fail(`${f.label}: minimum exceeds maximum.`);
      if (f.default !== undefined && f.default !== null) {
        const e = fieldError(f, f.default);
        if (e) fail(`${f.label}: invalid default (${e}).`);
      }
    }
  });
export type Definition = z.infer<typeof definitionSchema>;
export type Field = Definition["fields"][number];
export function scaled(s: string) {
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = (negative ? s.slice(1) : s).split(".");
  return (
    BigInt(whole!) * (negative ? -10000n : 10000n) +
    BigInt(fraction.padEnd(4, "0")) * (negative ? -1n : 1n)
  );
}
export function fieldError(f: Field, v: Value): string | null {
  if (v === null || v === "") return f.required ? "Required" : null;
  const r = f.validation;
  if (f.type === "checkbox")
    return typeof v === "boolean" ? null : "Choose checked or unchecked";
  if (typeof v !== "string") return "Use a text value";
  if (f.type === "text")
    return v.length >= (r.minLength ?? 0) &&
      v.length <= (r.maxLength ?? 4000) &&
      (!f.required || v.trim().length > 0)
      ? null
      : "Text length is outside the allowed range";
  if (f.type === "number")
    return decimal.safeParse(v).success &&
      (!r.min ||
        (decimal.safeParse(r.min).success && scaled(v) >= scaled(r.min))) &&
      (!r.max ||
        (decimal.safeParse(r.max).success && scaled(v) <= scaled(r.max)))
      ? null
      : "Number is outside the allowed format or range";
  if (f.type === "date")
    return civilDate.safeParse(v).success &&
      (!r.earliest || v >= r.earliest) &&
      (!r.latest || v <= r.latest)
      ? null
      : "Date is outside the allowed calendar range";
  return f.options.some((o) => o.key === v && !o.retired)
    ? null
    : "Choose an active option";
}
export class TrackerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TrackerError";
  }
}
export function validateValues(d: Definition, raw: unknown) {
  const input = valuesSchema.parse(raw),
    values: Record<string, Value> = {},
    errors: Record<string, string> = {};
  for (const key of Object.keys(input))
    if (!d.fields.some((f) => f.key === key && !f.retired))
      errors[key] = "Unknown or retired field";
  for (const f of d.fields.filter((f) => !f.retired)) {
    const v = input[f.key] === undefined ? (f.default ?? null) : input[f.key]!;
    const e = fieldError(f, v);
    if (e) errors[f.key] = e;
    values[f.key] = v;
  }
  if (Object.keys(errors).length)
    throw new TrackerError(
      422,
      Object.entries(errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
    );
  valuesSchema.parse(values);
  const title = String(values[d.titleKey] ?? "");
  if (title.length > 200)
    throw new TrackerError(422, "Title must be at most 200 characters.");
  return {
    values,
    title,
    status: d.statusKey ? (values[d.statusKey] as string | null) : null,
    deadline: d.deadlineKey ? (values[d.deadlineKey] as string | null) : null,
    completed:
      (d.completionKey !== null && values[d.completionKey] === true) ||
      (d.statusKey !== null &&
        d.completedStatusKeys.includes(String(values[d.statusKey]))),
  };
}
export const migrationRulesSchema = z
  .record(
    fieldKey,
    z
      .object({
        from: fieldKey.nullable(),
        conversion: z
          .enum(["copy", "text_to_number", "number_to_text", "text_to_date"])
          .default("copy"),
        value: scalar.optional(),
        optionMap: z.record(fieldKey, fieldKey).optional(),
      })
      .strict(),
  )
  .refine((v) => Object.keys(v).length <= 30);
export type MigrationRules = z.infer<typeof migrationRulesSchema>;
export function migrateValues(
  from: Definition,
  to: Definition,
  old: Record<string, Value>,
  rules: MigrationRules,
) {
  for (const [key, rule] of Object.entries(rules)) {
    if (
      !to.fields.some((f) => f.key === key && !f.retired) ||
      (rule.from !== null && !from.fields.some((f) => f.key === rule.from))
    )
      throw new TrackerError(
        422,
        "Migration mapping references an unavailable field.",
      );
  }
  const next: Record<string, Value> = {};
  for (const f of to.fields.filter((f) => !f.retired)) {
    const rule = rules[f.key],
      source = rule ? rule.from : f.key;
    const sourceField = from.fields.find((x) => x.key === source);
    let v =
      rule?.value !== undefined ? rule.value : source ? old[source] : undefined;
    if (
      v !== undefined &&
      v !== null &&
      v !== "" &&
      sourceField &&
      rule?.value === undefined
    ) {
      const conversion = rule?.conversion ?? "copy";
      if (
        sourceField.type !== f.type &&
        !(
          (conversion === "text_to_number" &&
            sourceField.type === "text" &&
            f.type === "number") ||
          (conversion === "number_to_text" &&
            sourceField.type === "number" &&
            f.type === "text") ||
          (conversion === "text_to_date" &&
            sourceField.type === "text" &&
            f.type === "date")
        )
      )
        throw new TrackerError(
          422,
          `${f.label}: choose an explicit supported conversion.`,
        );
      if (rule?.optionMap && typeof v === "string") v = rule.optionMap[v] ?? v;
    }
    if (v !== undefined) next[f.key] = v;
  }
  return validateValues(to, next);
}
const base = { clientCommandId: trackerId };
export const trackerCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("preset"),
      preset: z.enum(["learning", "books", "tasks"]),
      name: label,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("publish"),
      templateId: trackerId.nullable(),
      expectedVersionId: trackerId.nullable(),
      definition: definitionSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("create_tracker"),
      templateId: trackerId,
      versionId: trackerId,
      name: label,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("save_entry"),
      trackerId,
      entryId: trackerId.nullable(),
      expectedRevisionId: trackerId.nullable(),
      values: valuesSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("archive"),
      kind: z.enum(["tracker", "entry", "template"]),
      id: trackerId,
      expectedVersion: z.number().int().positive(),
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("preview"),
      trackerId,
      toVersionId: trackerId,
      rules: migrationRulesSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("confirm"),
      migrationId: trackerId,
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({ ...base, operation: z.literal("batch"), migrationId: trackerId })
    .strict(),
  z
    .object({ ...base, operation: z.literal("cancel"), migrationId: trackerId })
    .strict(),
]);
export type TrackerCommand = z.infer<typeof trackerCommandSchema>;
