import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

export const BUNDLE_MAX_BYTES = 10 * 1024 * 1024;
export const BUNDLE_MAX_ROWS = 10_000;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const entityKind = z
  .string()
  .regex(/^[a-z][a-z_]*\.[a-z][a-z_]*$/)
  .max(100);
const jsonRow = z.record(z.string().max(100), z.unknown());
const entitySchema = z
  .object({
    kind: entityKind,
    records: z.array(jsonRow).max(BUNDLE_MAX_ROWS),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const manifestSchema = z
  .object({
    format: z.literal("pmp-private-workspace"),
    manifestVersion: z.literal(1),
    mode: z.literal("replace_private_workspace"),
    schemaVersion: z.literal(127),
    generatedAt: z.iso.datetime(),
    sourceWorkspaceId: z.uuid(),
    financialRevision: z.string().regex(/^\d+$/),
    calculationDefinitions: z.array(z.string().min(1).max(100)).max(20),
    includedEntities: z.array(entityKind).max(100),
    excludedEntities: z.array(entityKind).max(100),
    attachmentBytesIncluded: z.literal(false),
    rowCount: z.number().int().min(0).max(BUNDLE_MAX_ROWS),
  })
  .strict();
const bundleSchema = z
  .object({
    manifest: manifestSchema,
    entities: z.array(entitySchema).max(100),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PortableBundle = z.infer<typeof bundleSchema>;
export type BundleManifest = z.infer<typeof manifestSchema>;
/** Contracts come from reviewed server code, never an uploaded bundle. A
 * missing contract is a restore blocker even when an entity has zero rows. */
export type PortableEntityContract = {
  schema: z.ZodType<Record<string, unknown>>;
  identityColumn: string;
  references: { column: string; targetKind: string; nullable: boolean }[];
};
export type PortableContracts = Readonly<
  Record<string, PortableEntityContract>
>;

const sensitiveKey =
  /(?:password|secret|token|session|credential|encryption_key|object_key|bucket_key|signed_url|provider_payload|recipient|email|command_payload)/i;
/** Reject repeated decoded keys, including escaped spellings. JSON.parse
 * alone silently retains the last value. Syntax is validated before this. */
export function rejectDuplicateJsonKeys(text: string) {
  const stack: {
    kind: "object" | "array";
    expectingKey: boolean;
    keys: Set<string>;
  }[] = [];
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === "{")
      stack.push({ kind: "object", expectingKey: true, keys: new Set() });
    else if (character === "[")
      stack.push({ kind: "array", expectingKey: false, keys: new Set() });
    else if (character === "}" || character === "]") stack.pop();
    else if (character === "," && stack.at(-1)?.kind === "object")
      stack.at(-1)!.expectingKey = true;
    else if (character === '"') {
      const start = i;
      for (i++; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      const frame = stack.at(-1);
      if (frame?.kind === "object" && frame.expectingKey) {
        if (i - start > 602) throw new Error("BUNDLE_VALUE_LIMIT");
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (frame.keys.has(key)) throw new Error("BUNDLE_DUPLICATE_JSON_KEY");
        frame.keys.add(key);
        frame.expectingKey = false;
      }
    }
    if (stack.length > 22) throw new Error("BUNDLE_NESTING_LIMIT");
  }
}
function inspectValue(value: unknown, workspaceId: string, depth = 0): void {
  if (depth > 20) throw new Error("BUNDLE_NESTING_LIMIT");
  if (["undefined", "bigint", "symbol", "function"].includes(typeof value))
    throw new Error("BUNDLE_NON_JSON_VALUE");
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error("BUNDLE_UNSAFE_NUMBER");
  if (Array.isArray(value)) {
    if (value.length > BUNDLE_MAX_ROWS) throw new Error("BUNDLE_VALUE_LIMIT");
    for (const v of value) inspectValue(v, workspaceId, depth + 1);
  } else if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error("BUNDLE_NON_JSON_VALUE");
    for (const [key, v] of Object.entries(value)) {
      if (
        sensitiveKey.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        throw new Error("BUNDLE_SENSITIVE_OR_UNSAFE_FIELD");
      if (key === "workspace_id" && v !== workspaceId)
        throw new Error("BUNDLE_FOREIGN_WORKSPACE");
      // Source identity is remapped, not an auth identity transferred between
      // owners. A supported serializer must explicitly emit this placeholder.
      if (/(?:^|_)user_id$/.test(key) && v !== null && v !== "$owner")
        throw new Error("BUNDLE_AUTH_IDENTITY_UNMAPPED");
      if (
        /(?:amount|balance|principal|interest|fee|credit|due|minor)/i.test(
          key,
        ) &&
        v !== null &&
        typeof v === "number"
      )
        throw new Error("BUNDLE_MONEY_MUST_BE_STRING");
      inspectValue(v, workspaceId, depth + 1);
    }
  } else if (typeof value === "string" && value.length > 20_000)
    throw new Error("BUNDLE_VALUE_LIMIT");
}

/** Evidence envelope only. Consistent snapshot generation, database audit,
 * expiry and authorization must be supplied by the future service boundary. */
export function createPortableEnvelope(
  manifest: BundleManifest,
  entities: { kind: string; records: Record<string, unknown>[] }[],
): PortableBundle {
  const m = manifestSchema.parse(manifest);
  const checked = entities.map((e) => {
    entityKind.parse(e.kind);
    inspectValue(e.records, m.sourceWorkspaceId);
    return { ...e, checksumSha256: digest(JSON.stringify(e.records)) };
  });
  const unsigned = { manifest: m, entities: checked };
  const bundle = bundleSchema.parse({
    ...unsigned,
    checksumSha256: digest(JSON.stringify(unsigned)),
  });
  if (Buffer.byteLength(JSON.stringify(bundle)) > BUNDLE_MAX_BYTES)
    throw new Error("BUNDLE_SIZE_LIMIT");
  return bundle;
}

export function inspectPortableBundle(
  bytes: Buffer,
  contracts: PortableContracts,
  requiredEntities: readonly string[],
) {
  if (bytes.length < 1 || bytes.length > BUNDLE_MAX_BYTES)
    throw new Error("BUNDLE_SIZE_LIMIT");
  let parsed: unknown;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    throw new Error("BUNDLE_JSON_INVALID");
  }
  rejectDuplicateJsonKeys(text);
  const bundle = bundleSchema.parse(parsed);
  const { checksumSha256, ...unsigned } = bundle;
  if (digest(JSON.stringify(unsigned)) !== checksumSha256)
    throw new Error("BUNDLE_CHECKSUM_MISMATCH");
  const manifest = bundle.manifest;
  const kinds = bundle.entities.map((e) => e.kind);
  if (
    new Set(kinds).size !== kinds.length ||
    new Set(manifest.includedEntities).size !==
      manifest.includedEntities.length ||
    new Set(manifest.excludedEntities).size !== manifest.excludedEntities.length
  )
    throw new Error("BUNDLE_DUPLICATE_ENTITY_KIND");
  if (
    manifest.includedEntities.length !== kinds.length ||
    manifest.includedEntities.some((k) => !kinds.includes(k)) ||
    manifest.excludedEntities.some((k) => kinds.includes(k))
  )
    throw new Error("BUNDLE_COVERAGE_MISMATCH");
  let count = 0;
  const identities = new Map<string, Set<string>>();
  const blockers = new Set<string>([
    "ATOMIC_REPLACEMENT_AND_RECOVERY_NOT_ACCEPTED",
  ]);
  for (const kind of requiredEntities)
    if (!kinds.includes(kind)) blockers.add(`MISSING_ENTITY:${kind}`);
  if (manifest.excludedEntities.length)
    blockers.add("EXCLUDED_ENTITIES_REQUIRE_EXPLICIT_RESTORE_REVIEW");
  for (const entity of bundle.entities) {
    count += entity.records.length;
    if (count > BUNDLE_MAX_ROWS) throw new Error("BUNDLE_ROW_LIMIT");
    if (digest(JSON.stringify(entity.records)) !== entity.checksumSha256)
      throw new Error("BUNDLE_ENTITY_CHECKSUM_MISMATCH");
    inspectValue(entity.records, manifest.sourceWorkspaceId);
    const contract = contracts[entity.kind];
    if (!contract) {
      blockers.add(`UNSUPPORTED_ENTITY:${entity.kind}`);
      continue;
    }
    const ids = new Set<string>();
    for (const row of entity.records) {
      contract.schema.parse(row);
      const id = z.uuid().parse(row[contract.identityColumn]);
      if (ids.has(id)) throw new Error("BUNDLE_DUPLICATE_IDENTITY");
      ids.add(id);
    }
    identities.set(entity.kind, ids);
  }
  if (count !== manifest.rowCount) throw new Error("BUNDLE_ROW_COUNT_MISMATCH");
  for (const entity of bundle.entities) {
    const contract = contracts[entity.kind];
    if (!contract) continue;
    for (const row of entity.records)
      for (const ref of contract.references) {
        const v = row[ref.column];
        if (v === null && ref.nullable) continue;
        if (typeof v !== "string" || !identities.get(ref.targetKind)?.has(v))
          throw new Error("BUNDLE_RELATIONSHIP_INVALID");
      }
  }
  return {
    bundle,
    rowCount: count,
    blockers: [...blockers].sort(),
    activationAllowed: false as const,
  };
}

/** A checksum is integrity evidence, not source trust or restore authority.
 * Remapping must be followed by full typed relationship/ledger validation. */
export function portableTargetId(
  workspaceId: string,
  restoreRunId: string,
  entity: string,
  sourceId: string,
) {
  z.uuid().parse(workspaceId);
  z.uuid().parse(restoreRunId);
  z.uuid().parse(sourceId);
  entityKind.parse(entity);
  const h = createHash("sha256")
    .update(
      `pmp/restore/v1/${workspaceId}/${restoreRunId}/${entity}/${sourceId}`,
    )
    .digest()
    .subarray(0, 16);
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const s = h.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function assertPortableJournalBalance(
  postings: { journalId: string; amountMinor: string }[],
) {
  if (postings.length > BUNDLE_MAX_ROWS) throw new Error("BUNDLE_ROW_LIMIT");
  const totals = new Map<string, { count: number; total: bigint }>();
  for (const p of postings) {
    z.object({
      journalId: z.uuid(),
      amountMinor: z.string().regex(/^-?[1-9]\d{0,17}$/),
    })
      .strict()
      .parse(p);
    const amount = BigInt(p.amountMinor);
    if (
      amount > MAX_FINANCIAL_COMPONENT_MINOR ||
      amount < -MAX_FINANCIAL_COMPONENT_MINOR
    )
      throw new Error("BUNDLE_POSTING_AMOUNT_LIMIT");
    const previous = totals.get(p.journalId) ?? { count: 0, total: 0n };
    totals.set(p.journalId, {
      count: previous.count + 1,
      total: previous.total + BigInt(p.amountMinor),
    });
  }
  if ([...totals.values()].some((j) => j.count < 2 || j.total !== 0n))
    throw new Error("BUNDLE_JOURNAL_UNBALANCED");
}
