import { it, expect } from "vitest";
import { graphRegistry } from "@/modules/portability/domain/graph-registry";
import { previewDigest } from "@/modules/portability/domain/csv-preview";
import { validateWorkspaceGraph } from "@/modules/portability/services/workspace-bundles";
it("upgrades a checksummed V2-H graph by adding empty shared links without changing its financial evidence or original object", () => {
  const oldRegistry = graphRegistry.filter(
    (d) =>
      ![
        "finance.group_ledger_binding",
        "finance.private_group_link",
        "finance.private_group_link_revision",
        "finance.private_group_review",
      ].includes(d.kind),
  );
  const unsigned = {
      manifest: {
        format: "pmp-private-workspace-graph",
        manifestVersion: 2,
        schemaFingerprint: previewDigest(oldRegistry),
        sourceWorkspaceId: "11111111-1111-4111-8111-111111111111",
        generatedAt: "2026-10-15T00:00:00Z",
        financialRevision: "9007199254740993",
        currency: "PHP",
        timezone: "Asia/Manila",
        weekStart: 1,
        rowCount: 0,
        attachmentBytesIncluded: false,
        excluded: [],
        notificationConsentRestored: false,
        calculationDefinitions: [],
      },
      entities: oldRegistry.map((d) => ({ kind: d.kind, records: [] })),
    },
    legacy = { ...unsigned, checksumSha256: previewDigest(unsigned) },
    original = structuredClone(legacy),
    normalized = validateWorkspaceGraph(legacy);
  expect(legacy).toEqual(original);
  expect(normalized.entities).toHaveLength(graphRegistry.length);
  expect(normalized.manifest.financialRevision).toBe("9007199254740993");
  expect(normalized.manifest.schemaFingerprint).toBe(
    previewDigest(graphRegistry),
  );
  expect(
    normalized.entities
      .filter((e) => !oldRegistry.some((d) => d.kind === e.kind))
      .every((e) => e.records.length === 0),
  ).toBe(true);
  expect(validateWorkspaceGraph(normalized)).toEqual(normalized);
});
