import { randomUUID } from "node:crypto";
import { z } from "zod";
import { expect, it } from "vitest";
import {
  assertPortableJournalBalance,
  createPortableEnvelope,
  inspectPortableBundle,
  portableTargetId,
  type BundleManifest,
  type PortableContracts,
} from "@/modules/portability/domain/portable-bundle";
const sourceWorkspaceId = randomUUID(),
  parent = randomUUID(),
  child = randomUUID();
const manifest: BundleManifest = {
  format: "pmp-private-workspace",
  manifestVersion: 1,
  mode: "replace_private_workspace",
  schemaVersion: 127,
  generatedAt: "2026-10-15T12:00:00Z",
  sourceWorkspaceId,
  financialRevision: "9007199254740993",
  calculationDefinitions: ["v2-a6-integrated-cards-1"],
  includedEntities: ["finance.financial_action", "finance.action_revision"],
  excludedEntities: [],
  attachmentBytesIncluded: false,
  rowCount: 2,
};
// Synthetic contracts deliberately cover only these two testing entities.
// They are not product serializers or a complete restorable financial graph.
const contracts: PortableContracts = {
  "finance.financial_action": {
    schema: z.object({ id: z.uuid(), workspace_id: z.uuid() }).strict(),
    identityColumn: "id",
    references: [],
  },
  "finance.action_revision": {
    schema: z
      .object({
        id: z.uuid(),
        workspace_id: z.uuid(),
        action_id: z.uuid(),
        amount_minor: z.string().regex(/^\d+$/),
      })
      .strict(),
    identityColumn: "id",
    references: [
      {
        column: "action_id",
        targetKind: "finance.financial_action",
        nullable: false,
      },
    ],
  },
};
const entities = (): { kind: string; records: Record<string, unknown>[] }[] => [
  {
    kind: "finance.financial_action",
    records: [{ id: parent, workspace_id: sourceWorkspaceId }],
  },
  {
    kind: "finance.action_revision",
    records: [
      {
        id: child,
        workspace_id: sourceWorkspaceId,
        action_id: parent,
        amount_minor: "9007199254740993",
      },
    ],
  },
];
const inspect = (m = manifest, e = entities(), c = contracts) =>
  inspectPortableBundle(
    Buffer.from(JSON.stringify(createPortableEnvelope(m, e))),
    c,
    manifest.includedEntities,
  );
it("validates exact envelope integrity without granting restore activation", () => {
  const p = inspect();
  expect(p.rowCount).toBe(2);
  expect(p.activationAllowed).toBe(false);
  expect(p.blockers).toEqual(["ATOMIC_REPLACEMENT_AND_RECOVERY_NOT_ACCEPTED"]);
  expect(p.bundle.entities[1]!.records[0]!.amount_minor).toBe(
    "9007199254740993",
  );
});
it("rejects duplicate JSON keys despite an otherwise valid checksum", () => {
  const b = JSON.stringify(createPortableEnvelope(manifest, entities()));
  const normal = `"id":"${parent}"`;
  for (const spelling of ['"id"', '"\\u0069d"']) {
    const repeated = b.replace(
      normal,
      `${spelling}:"${randomUUID()}",${normal}`,
    );
    expect(() =>
      inspectPortableBundle(Buffer.from(repeated), contracts, []),
    ).toThrow("BUNDLE_DUPLICATE_JSON_KEY");
  }
});
it("rejects tampering and incompatible schemas", () => {
  const b = createPortableEnvelope(manifest, entities());
  b.entities[1]!.records[0]!.amount_minor = "1";
  expect(() =>
    inspectPortableBundle(Buffer.from(JSON.stringify(b)), contracts, []),
  ).toThrow("BUNDLE_CHECKSUM_MISMATCH");
  expect(() =>
    createPortableEnvelope(
      { ...manifest, schemaVersion: 126 } as unknown as BundleManifest,
      entities(),
    ),
  ).toThrow();
});
it("rejects foreign scope, raw auth identities, storage keys, secrets and unsafe numbers", () => {
  for (const additional of [
    { workspace_id: randomUUID() },
    { recorded_by_user_id: randomUUID() },
    { password_hash: "fake" },
    { object_key: "private" },
    { session_id: "fake" },
    { amount_minor: 12 },
    { test: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const e = entities();
    e[1]!.records[0]! = { ...e[1]!.records[0]!, ...additional };
    expect(() => createPortableEnvelope(manifest, e)).toThrow();
  }
});
it("blocks unsupported kinds and incomplete coverage, including empty entities", () => {
  const p = inspect(manifest, entities(), {});
  expect(p.blockers).toContain("UNSUPPORTED_ENTITY:finance.financial_action");
  const e = [{ kind: "finance.financial_action", records: [] }];
  const partial = inspect(
    {
      ...manifest,
      includedEntities: [e[0]!.kind],
      excludedEntities: ["finance.action_revision"],
      rowCount: 0,
    },
    e,
  );
  expect(partial.blockers).toContain("MISSING_ENTITY:finance.action_revision");
  expect(partial.blockers).toContain(
    "EXCLUDED_ENTITIES_REQUIRE_EXPLICIT_RESTORE_REVIEW",
  );
  expect(partial.activationAllowed).toBe(false);
});
it("rejects duplicate identities, missing references and false counts", () => {
  const duplicate = entities();
  duplicate[0]!.records.push({ ...duplicate[0]!.records[0]! });
  expect(() => inspect({ ...manifest, rowCount: 3 }, duplicate)).toThrow(
    "BUNDLE_DUPLICATE_IDENTITY",
  );
  const orphan = entities();
  orphan[1]!.records[0]!.action_id = randomUUID();
  expect(() => inspect(manifest, orphan)).toThrow(
    "BUNDLE_RELATIONSHIP_INVALID",
  );
  expect(() => inspect({ ...manifest, rowCount: 1 })).toThrow(
    "BUNDLE_ROW_COUNT_MISMATCH",
  );
  expect(() =>
    inspect({ ...manifest, includedEntities: ["finance.financial_action"] }),
  ).toThrow("BUNDLE_COVERAGE_MISMATCH");
});
it("rejects duplicate entity kinds and unsupported group coverage", () => {
  const e = entities();
  e.push(e[0]!);
  expect(() => inspect({ ...manifest, rowCount: 3 }, e)).toThrow(
    "BUNDLE_DUPLICATE_ENTITY_KIND",
  );
  const group = [{ kind: "groups.expense", records: [] }];
  expect(
    inspect(
      { ...manifest, includedEntities: ["groups.expense"], rowCount: 0 },
      group,
    ).blockers,
  ).toContain("UNSUPPORTED_ENTITY:groups.expense");
});
it("remaps identities deterministically and separately by target, run and kind", () => {
  const w = randomUUID(),
    r = randomUUID();
  const id = portableTargetId(w, r, "finance.financial_action", parent);
  expect(z.uuid().parse(id)).toBe(id);
  expect(portableTargetId(w, r, "finance.financial_action", parent)).toBe(id);
  expect(
    portableTargetId(randomUUID(), r, "finance.financial_action", parent),
  ).not.toBe(id);
  expect(
    portableTargetId(w, randomUUID(), "finance.financial_action", parent),
  ).not.toBe(id);
  expect(portableTargetId(w, r, "finance.action_revision", parent)).not.toBe(
    id,
  );
  expect(() => portableTargetId(w, r, "../unsafe", parent)).toThrow();
});
it("validates each journal using exact signed arithmetic", () => {
  assertPortableJournalBalance([
    { journalId: parent, amountMinor: "100000000000" },
    { journalId: parent, amountMinor: "-100000000000" },
  ]);
  expect(() =>
    assertPortableJournalBalance([
      { journalId: parent, amountMinor: "100000000001" },
      { journalId: parent, amountMinor: "-100000000001" },
    ]),
  ).toThrow("BUNDLE_POSTING_AMOUNT_LIMIT");
  expect(() =>
    assertPortableJournalBalance([
      { journalId: parent, amountMinor: "100" },
      { journalId: child, amountMinor: "-100" },
    ]),
  ).toThrow("BUNDLE_JOURNAL_UNBALANCED");
  expect(() =>
    assertPortableJournalBalance([
      { journalId: parent, amountMinor: "100" },
      { journalId: parent, amountMinor: "-99" },
    ]),
  ).toThrow("BUNDLE_JOURNAL_UNBALANCED");
  expect(() =>
    assertPortableJournalBalance([{ journalId: parent, amountMinor: "1.0" }]),
  ).toThrow();
});
it("rejects oversized, malformed, unsafe or excessively nested JSON", () => {
  expect(() =>
    inspectPortableBundle(Buffer.alloc(10 * 1024 * 1024 + 1), contracts, []),
  ).toThrow("BUNDLE_SIZE_LIMIT");
  expect(() =>
    inspectPortableBundle(Buffer.from([255]!), contracts, []),
  ).toThrow("BUNDLE_JSON_INVALID");
  const e = entities();
  e[0]!.records[0]! = JSON.parse(`{"id":"${parent}","__proto__":{"test":1}}`);
  expect(() => createPortableEnvelope(manifest, e)).toThrow(
    "BUNDLE_SENSITIVE_OR_UNSAFE_FIELD",
  );
  let nested: unknown = "leaf";
  for (let i = 0; i < 22; i++) nested = { value: nested };
  e[0]!.records[0]! = { id: parent, nested };
  expect(() => createPortableEnvelope(manifest, e)).toThrow(
    "BUNDLE_NESTING_LIMIT",
  );
});
it("does not silently serialize unsupported source values or sparse arrays", () => {
  for (const value of [
    undefined,
    1n,
    new Date(),
    new Map(),
    () => "value",
    Array(2),
  ]) {
    const e = entities();
    e[0]!.records[0]!.raw_value = value;
    expect(() => createPortableEnvelope(manifest, e)).toThrow(
      "BUNDLE_NON_JSON_VALUE",
    );
  }
});
