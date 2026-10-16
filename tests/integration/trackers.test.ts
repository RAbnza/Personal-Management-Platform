import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import {
  getAuthPool,
  getDomainPool,
  closeRuntimeDatabasePools,
} from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { recordTrackerCommand as command } from "@/modules/trackers/services/commands";
import { readTrackers } from "@/modules/trackers/services/reads";
import { getTrackerReport } from "@/modules/trackers/services/reports";
import { listAgendaItems } from "@/modules/time/services/list-agenda-items";
import { getReminder, mutateReminder } from "@/modules/time/services/reminders";
import {
  validateWorkspaceGraph,
  remapForeignGraph,
  downloadWorkspaceRecovery,
} from "@/modules/portability/services/workspace-bundles";
import { previewDigest } from "@/modules/portability/domain/csv-preview";
import { presets } from "@/modules/trackers/domain/presets";
import type { Definition } from "@/modules/trackers/domain/tracker";
import {
  exportWorkspace,
  prepareWorkspaceExport,
  previewWorkspaceRestore,
  restoreWorkspace,
} from "@/modules/portability/services/workspace-bundles";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
import { makeDeletionPending } from "./helpers/lifecycle-proof";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { readDeletionScope } from "@/modules/core/repositories/lifecycle-repository";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
type Owner = { userId: string; workspaceId: string };
const label = "V3 tracker fixture";
afterAll(closeRuntimeDatabasePools);
async function fixture(run: (a: Owner, b: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let n = 0; n < 2; n++) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const w = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId: w.workspaceId });
    }
    await run(owners[0]!, owners[1]!);
  } finally {
    for (const o of owners) await removeNamedFinancialFixture(o, label);
  }
}
const run = (o: Owner, body: Record<string, unknown>) =>
  command(o, { clientCommandId: randomUUID(), ...body });
const preset = (o: Owner, key = "learning") =>
  run(o, { operation: "preset", preset: key, name: "Private tracker" });
const save = (
  o: Owner,
  trackerId: unknown,
  values: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  run(o, {
    operation: "save_entry",
    trackerId,
    values,
    entryId: null,
    expectedRevisionId: null,
    reason: "Synthetic entry",
    ...extra,
  });
const publish = (o: Owner, p: Record<string, unknown>, d: Definition) =>
  run(o, {
    operation: "publish",
    templateId: p.templateId,
    expectedVersionId: p.versionId,
    definition: d,
    reason: "Reviewed definition change",
  });
async function view(
  o: Owner,
  id: unknown,
  kind: "entry" | "tracker" | "migration" | "template",
) {
  return readTrackers(o, { view: kind, id: String(id) });
}
describe("V3 private versioned tracker boundaries", () => {
  it("restores a reviewed pre-tracker snapshot and preserves completed export replay", () =>
    fixture(async (a) => {
      const key = randomUUID(),
        exported = await prepareWorkspaceExport(a, key),
        bundle = await exportWorkspace(a),
        review = await previewWorkspaceRestore(a, {
          clientCommandId: randomUUID(),
          bundle,
        });
      const p = await preset(a);
      await save(a, p.trackerId, { topic: "Replaced by reviewed snapshot" });
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: String(review.runId),
        previewHash: String(review.previewHash),
        confirmation: "replace-private-workspace",
      });
      expect(await prepareWorkspaceExport(a, key)).toEqual(exported);
      const overview = await readTrackers(a);
      if (overview.view !== "overview") throw new Error();
      expect(overview.trackers).toHaveLength(0);
    }));
  it("round-trips immutable tracker graphs, remaps identities without rewriting literal values, and recovers replaced history", () =>
    fixture(async (a, b) => {
      const definition = structuredClone(presets.learning);
      for (const key of ["workspace_id", "user_id"])
        definition.fields.push({ ...definition.fields[1]!, key, label: key });
      const published = await run(a, {
          operation: "publish",
          templateId: null,
          expectedVersionId: null,
          definition,
          reason: "Literal field names",
        }),
        p = await run(a, {
          operation: "create_tracker",
          templateId: published.templateId,
          versionId: published.versionId,
          name: "Literal values",
        }),
        e = await save(a, p.trackerId, {
          topic: a.workspaceId,
          workspace_id: a.workspaceId,
          user_id: a.userId,
          technology: a.userId,
          notes: "$owner",
          due: "2026-10-16",
        });
      await save(
        a,
        p.trackerId,
        {
          topic: a.workspaceId,
          workspace_id: a.workspaceId,
          user_id: a.userId,
          technology: a.userId,
          notes: "$workspace",
          due: "2026-10-17",
        },
        { entryId: e.entryId, expectedRevisionId: e.revisionId },
      );
      definition.fields[0]!.label = "Renamed literal title";
      const next = await publish(a, published, definition);
      await run(a, {
        operation: "preview",
        trackerId: p.trackerId,
        toVersionId: next.versionId,
        rules: {},
      });
      const bundle = validateWorkspaceGraph(await exportWorkspace(a));
      expect(
        bundle.entities.filter((e) => e.kind.startsWith("tracker.")),
      ).toHaveLength(9);
      const previewReceipt = bundle.entities
        .find((e) => e.kind === "core.command_receipt")!
        .records.find((r) => r.command_type === "tracker.preview")!;
      expect(
        (
          previewReceipt.result_json as {
            counts: { samples: { before: Record<string, unknown> }[] };
          }
        ).counts.samples[0]!.before.user_id,
      ).toBe(a.userId);
      const mapped = remapForeignGraph(bundle, b.workspaceId).bundle;
      expect(
        mapped.entities
          .find((e) => e.kind === "tracker.entry_revision")!
          .records.map(
            (r) => (r.values_json as Record<string, unknown>).technology,
          ),
      ).toEqual([a.userId, a.userId]);
      const review = await previewWorkspaceRestore(b, {
        clientCommandId: randomUUID(),
        bundle,
      });
      await restoreWorkspace(b, {
        clientCommandId: randomUUID(),
        runId: String(review.runId),
        previewHash: String(review.previewHash),
        confirmation: "replace-private-workspace",
      });
      const restored = await exportWorkspace(b),
        revisions = restored.entities.find(
          (e) => e.kind === "tracker.entry_revision",
        )!.records;
      const restoredReceipt = restored.entities
        .find((e) => e.kind === "core.command_receipt")!
        .records.find((r) => r.command_type === "tracker.preview")!;
      expect(
        (
          restoredReceipt.result_json as {
            counts: { samples: { before: Record<string, unknown> }[] };
          }
        ).counts.samples[0]!.before.user_id,
      ).toBe(a.userId);
      expect(revisions).toHaveLength(2);
      for (const r of revisions)
        expect(r.values_json).toMatchObject({
          workspace_id: a.workspaceId,
          user_id: a.userId,
        });
      expect(
        revisions.every(
          (r) =>
            (r.values_json as Record<string, unknown>).topic === a.workspaceId,
        ),
      ).toBe(true);
      const own = await previewWorkspaceRestore(a, {
        clientCommandId: randomUUID(),
        bundle,
      });
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: String(own.runId),
        previewHash: String(own.previewHash),
        confirmation: "replace-private-workspace",
      });
      const recovery = await downloadWorkspaceRecovery(a, String(own.runId));
      expect(
        recovery.entities
          .find((e) => e.kind === "tracker.entry_revision")!
          .records.every(
            (r) =>
              (r.values_json as Record<string, unknown>).technology ===
              a.userId,
          ),
      ).toBe(true);
      const bad = structuredClone(bundle);
      bad.entities.find((e) => e.kind === "tracker.entry")!.records[0]!.title =
        "Fabricated";
      bad.checksumSha256 = previewDigest({
        manifest: bad.manifest,
        entities: bad.entities,
      });
      expect(() => validateWorkspaceGraph(bad)).toThrow("inconsistent");
      await expect(view(b, e.entryId, "entry")).rejects.toThrow("unavailable");
    }));
  it("reports recorded completion and reopening separately from manual dates and current archived state", () =>
    fixture(async (a, b) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Report",
          completed_date: "2000-01-01",
          due: "2000-01-02",
        });
      const complete = await save(
        a,
        p.trackerId,
        { topic: "Report", status: "completed", completed_date: "2000-01-01" },
        { entryId: e.entryId, expectedRevisionId: e.revisionId },
      );
      await save(
        a,
        p.trackerId,
        {
          topic: "Report",
          status: "active",
          completed_date: "2000-01-01",
          due: "2000-01-02",
        },
        { entryId: e.entryId, expectedRevisionId: complete.revisionId },
      );
      const latest = await view(a, e.entryId, "entry");
      if (latest.view !== "entry") throw new Error();
      await save(
        a,
        p.trackerId,
        { topic: "Report", status: "active", due: "2000-01-02" },
        {
          entryId: e.entryId,
          expectedRevisionId: latest.entry.current_revision_id,
          reason: "Template migration user-written reason",
        },
      );
      const r = await getTrackerReport(a, { period: "year" });
      expect(r.counts).toMatchObject({
        entries: 1,
        completed: 0,
        overdue: 1,
        created: 1,
        completedTransitions: 1,
        reopened: 1,
        edits: 1,
        migrationRevisions: 0,
      });
      expect(r.coverage).toHaveLength(1);
      expect(r.current[0]!.href).toContain(String(e.entryId));
      expect(
        (
          await getTrackerReport(a, {
            period: "custom",
            startDate: "2000-01-01",
            endDate: "2000-12-31",
          })
        ).events,
      ).toHaveLength(0);
      await expect(
        getTrackerReport(b, { trackerId: String(p.trackerId) }),
      ).rejects.toThrow("unavailable");
      const data = await view(a, e.entryId, "entry");
      if (data.view !== "entry") throw new Error();
      await run(a, {
        operation: "archive",
        kind: "entry",
        id: e.entryId,
        expectedVersion: data.entry.version,
        archived: true,
      });
      expect((await getTrackerReport(a)).counts.entries).toBe(0);
      expect(
        (await getTrackerReport(a, { archived: "archived" })).counts,
      ).toMatchObject({ entries: 1, overdue: 0 });
    }));
  it("projects one date-only source and retires dismissed generations on deadline, completion and archive changes", () =>
    fixture(async (a, b) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Private title",
          due: "2026-10-16",
        });
      const target = {
        sourceKind: "tracker_entry" as const,
        sourceId: String(e.entryId),
      };
      const agenda = () =>
        listAgendaItems({
          ...a,
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        });
      const first = await agenda();
      expect(first.items).toHaveLength(1);
      expect(first.items[0]!.sourceId).toBe(e.entryId);
      const reminder = await getReminder(a, target);
      expect(reminder.eligible).toBe(true);
      expect(reminder.timezone).toBe("Asia/Manila");
      await mutateReminder(a, {
        clientCommandId: randomUUID(),
        target,
        expectedSnapshot: reminder.snapshot,
        action: { kind: "dismiss", ruleKey: reminder.rules[0]!.key },
      });
      const edit = await save(
        a,
        p.trackerId,
        { topic: "Changed title", due: "2026-10-17" },
        { entryId: e.entryId, expectedRevisionId: e.revisionId },
      );
      const next = await getReminder(a, target);
      expect(next.sourceGeneration).toBe(reminder.sourceGeneration! + 1);
      expect(next.rules[0]!.state).toBe("active");
      expect(next.history.some((h) => h.state === "cancelled")).toBe(true);
      await mutateReminder(a, {
        clientCommandId: randomUUID(),
        target,
        expectedSnapshot: next.snapshot,
        action: {
          kind: "settings",
          mode: "override",
          rules: [{ offsetDays: 0, localTime: "10:00" }],
        },
      });
      const overridden = await getReminder(a, target);
      expect(overridden.mode).toBe("override");
      await mutateReminder(a, {
        clientCommandId: randomUUID(),
        target,
        expectedSnapshot: overridden.snapshot,
        action: {
          kind: "snooze",
          ruleKey: overridden.rules[0]!.key,
          snoozedUntil: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      expect((await getReminder(a, target)).rules[0]!.state).toBe("snoozed");
      const complete = await save(
        a,
        p.trackerId,
        { topic: "Changed title", status: "completed", due: "2026-10-17" },
        { entryId: e.entryId, expectedRevisionId: edit.revisionId },
      );
      expect((await agenda()).items).toHaveLength(0);
      expect((await getReminder(a, target)).eligible).toBe(false);
      await save(
        a,
        p.trackerId,
        { topic: "Changed title", due: "2026-10-17" },
        { entryId: e.entryId, expectedRevisionId: complete.revisionId },
      );
      expect((await agenda()).items).toHaveLength(1);
      await run(a, {
        operation: "archive",
        kind: "tracker",
        id: p.trackerId,
        expectedVersion: 1,
        archived: true,
      });
      expect((await agenda()).items).toHaveLength(0);
      await run(a, {
        operation: "archive",
        kind: "tracker",
        id: p.trackerId,
        expectedVersion: 2,
        archived: false,
      });
      expect((await agenda()).items).toHaveLength(1);
      await expect(getReminder(b, target)).rejects.toThrow();
    }));
  it("removes migration-unmapped deadlines and separates migration activity from compatible custom progress", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Mapped deadline",
          due: "2026-10-16",
        });
      const before = await getReminder(a, {
        sourceKind: "tracker_entry",
        sourceId: String(e.entryId),
      });
      const d = structuredClone(presets.learning);
      d.deadlineKey = null;
      const next = await publish(a, p, d),
        preview = await run(a, {
          operation: "preview",
          trackerId: p.trackerId,
          toVersionId: next.versionId,
          rules: {},
        });
      await run(a, {
        operation: "confirm",
        migrationId: preview.migrationId,
        previewHash: preview.previewHash,
      });
      await run(a, { operation: "batch", migrationId: preview.migrationId });
      expect(
        (
          await listAgendaItems({
            ...a,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          })
        ).items,
      ).toHaveLength(0);
      expect(
        (
          await getReminder(a, {
            sourceKind: "tracker_entry",
            sourceId: String(e.entryId),
          })
        ).eligible,
      ).toBe(false);
      expect(before.eligible).toBe(true);
      const custom = structuredClone(presets.books);
      custom.completionKey = null;
      const template = await run(a, {
        operation: "publish",
        templateId: null,
        expectedVersionId: null,
        definition: custom,
        reason: "No mapped progress",
      });
      const tr = await run(a, {
        operation: "create_tracker",
        templateId: template.templateId,
        versionId: template.versionId,
        name: "No progress mapping",
      });
      await save(a, tr.trackerId, { title: "Custom book", finished: true });
      const r = await getTrackerReport(a, { period: "year" });
      expect(r.counts).toMatchObject({
        entries: 2,
        completionEligible: 1,
        completed: 0,
        created: 2,
        migrationRevisions: 1,
      });
      expect(r.coverage).toHaveLength(3);
    }));
  it("keeps existing financial postings exact and blocks writes after lifecycle transition", () =>
    fixture(async (a, b) => {
      await openFinancialAccount({
        ...a,
        clientCommandId: randomUUID(),
        name: "Preserved cash",
        accountType: "checking",
        openingCutoffDate: "2026-10-01",
        openingBalanceMinor: "99999999999",
      });
      const evidence = () =>
        withDomainTransaction(
          a,
          async (t) =>
            (
              await t.db.execute(
                sql`SELECT financial_revision::text revision,(SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount_minor::text) ORDER BY id) FROM finance.posting) postings FROM core.workspace WHERE id=${a.workspaceId}::uuid`,
              )
            ).rows[0],
        );
      const before = await evidence(),
        p = await preset(a);
      await save(a, p.trackerId, { topic: "Keep balances" });
      expect(await evidence()).toEqual(before);
      const scope = await withDomainTransaction(a, (t) =>
        readDeletionScope(t, a),
      );
      expect(
        scope?.records.find((r) => r.area === "tracker" && r.kind === "entry")
          ?.count,
      ).toBe("1");
      const client = await getDomainPool().connect();
      try {
        await runScopedTransactionOnClient(client, a, async () =>
          makeDeletionPending(client, a),
        );
      } finally {
        client.release();
      }
      await expect(
        save(a, p.trackerId, { topic: "Denied after deletion" }),
      ).rejects.toThrow("active private workspace");
      const other = await readTrackers(b);
      if (other.view !== "overview") throw new Error();
      expect(other.trackers).toHaveLength(0);
    }));
  it("enforces cross-workspace foreign keys, published options and derived values under runtime roles", () =>
    fixture(async (a, b) => {
      const p = await preset(a),
        foreign = await preset(b),
        e = await save(a, p.trackerId, { topic: "Consistent" });
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`INSERT INTO tracker.field_identity(workspace_id,template_id,stable_key,command_receipt_id,recorded_by_user_id) SELECT ${a.workspaceId}::uuid,${foreign.templateId}::uuid,'foreign_field',command_receipt_id,${a.userId}::uuid FROM tracker.template WHERE id=${p.templateId}::uuid`,
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`INSERT INTO tracker.field_option(workspace_id,field_definition_id,option_key,label,position,retired,command_receipt_id,recorded_by_user_id) SELECT workspace_id,id,'injected','Injected',99,false,command_receipt_id,recorded_by_user_id FROM tracker.field_definition WHERE template_version_id=${p.versionId}::uuid AND field_type='single_select'`,
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE tracker.entry SET title='Forged title' WHERE id=${e.entryId}::uuid`,
          ),
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("retires fields and select options while retaining old values and completion history", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Retain history",
          technology: "Old detail",
          status: "active",
        });
      const d = structuredClone(presets.learning);
      d.fields.find((f) => f.key === "technology")!.retired = true;
      d.fields
        .find((f) => f.key === "status")!
        .options.find((o) => o.key === "active")!.retired = true;
      const next = await publish(a, p, d),
        preview = await run(a, {
          operation: "preview",
          trackerId: p.trackerId,
          toVersionId: next.versionId,
          rules: {
            status: {
              from: "status",
              conversion: "copy",
              optionMap: { active: "completed" },
            },
          },
        });
      await run(a, {
        operation: "confirm",
        migrationId: preview.migrationId,
        previewHash: preview.previewHash,
      });
      await run(a, { operation: "batch", migrationId: preview.migrationId });
      const entry = await view(a, e.entryId, "entry");
      if (entry.view !== "entry") throw new Error();
      expect(entry.entry.values).not.toHaveProperty("technology");
      expect(entry.entry.completed_at).not.toBe(null);
      expect(entry.history[1]!.values_json).toMatchObject({
        technology: "Old detail",
        status: "active",
      });
      const invalid = structuredClone(d);
      invalid.fields.find((f) => f.key === "technology")!.retired = false;
      await expect(
        publish(a, { ...p, versionId: next.versionId }, invalid),
      ).rejects.toThrow("cannot be reused");
    }));
  it("creates all presets privately with forced RLS and no financial effects", () =>
    fixture(async (a, b) => {
      for (const key of ["learning", "books", "tasks"]) await preset(a, key);
      const mine = await readTrackers(a);
      expect(mine.view).toBe("overview");
      if (mine.view === "overview") {
        expect(mine.trackers).toHaveLength(3);
        expect(mine.templates).toHaveLength(3);
      }
      const other = await readTrackers(b);
      if (other.view === "overview") expect(other.trackers).toHaveLength(0);
      const c = await getDomainPool().query(
        "SELECT count(*)::int n FROM tracker.tracker",
      );
      expect(c.rows[0].n).toBe(0);
      const r = await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT financial_revision::text revision,(SELECT count(*)::int FROM finance.financial_action) actions FROM core.workspace WHERE id=${a.workspaceId}::uuid`,
            )
          ).rows[0],
      );
      expect(r).toMatchObject({ revision: "0", actions: 0 });
      const policies = await getDomainPool().query(
        "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tracker' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity",
      );
      expect(policies.rows[0].n).toBe(9);
    }));
  it("replays identical commands and rejects command-key reuse", () =>
    fixture(async (a) => {
      const body = {
        operation: "preset",
        preset: "books",
        name: "Books",
        clientCommandId: randomUUID(),
      };
      const results = await Promise.all([command(a, body), command(a, body)]);
      expect(results[0]).toEqual(results[1]);
      await expect(command(a, { ...body, name: "Different" })).rejects.toThrow(
        "different command payload",
      );
    }));
  it("rejects foreign tracker/template/entry/migration references without leaking data", () =>
    fixture(async (a, b) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, { topic: "Secret" });
      await expect(view(b, p.trackerId, "tracker")).rejects.toThrow(
        "unavailable",
      );
      await expect(view(b, e.entryId, "entry")).rejects.toThrow("unavailable");
      await expect(
        run(b, {
          operation: "create_tracker",
          templateId: p.templateId,
          versionId: p.versionId,
          name: "Stolen",
        }),
      ).rejects.toThrow("unavailable");
      await expect(save(b, p.trackerId, { topic: "Foreign" })).rejects.toThrow(
        "unavailable",
      );
    }));
  it("keeps immutable history and rejects stale concurrent edits", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Original",
          technology: "TS",
          due: "2026-10-16",
        });
      const cmds = ["First", "Second"].map((topic) =>
        save(
          a,
          p.trackerId,
          { topic, technology: "TS" },
          { entryId: e.entryId, expectedRevisionId: e.revisionId },
        ),
      );
      const r = await Promise.allSettled(cmds);
      expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1);
      expect(r.filter((v) => v.status === "rejected")).toHaveLength(1);
      const d = await view(a, e.entryId, "entry");
      if (d.view !== "entry") throw new Error();
      expect(d.history).toHaveLength(2);
      expect(d.history[1]!.values_json.topic).toBe("Original");
      expect(d.entry.deadline_date).toBe(null);
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE tracker.entry_revision SET reason='changed' WHERE id=${e.revisionId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`DELETE FROM tracker.entry WHERE id=${e.entryId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
    }));
  it("rejects wrong current revision pointers and rolls back malformed writes/receipts", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e1 = await save(a, p.trackerId, { topic: "One" }),
        e2 = await save(a, p.trackerId, { topic: "Two" });
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE tracker.entry SET current_revision_id=${e2.revisionId}::uuid WHERE id=${e1.entryId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      const clientCommandId = randomUUID();
      await expect(
        run(a, {
          operation: "save_entry",
          trackerId: p.trackerId,
          entryId: null,
          expectedRevisionId: null,
          values: { topic: "Bad", status: "missing" },
          reason: "Invalid",
          clientCommandId,
        }),
      ).rejects.toThrow("active option");
      const r = await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT id FROM core.command_receipt WHERE client_command_id=${clientCommandId}::uuid`,
            )
          ).rows,
      );
      expect(r).toHaveLength(0);
    }));
  it("publishes custom templates, stable renamed fields and immutable definitions", () =>
    fixture(async (a) => {
      const d = structuredClone(presets.tasks),
        p = await run(a, {
          operation: "publish",
          templateId: null,
          expectedVersionId: null,
          definition: d,
          reason: "My custom template",
        });
      const tr = await run(a, {
        operation: "create_tracker",
        templateId: p.templateId,
        versionId: p.versionId,
        name: "Mine",
      });
      await save(a, tr.trackerId, { title: "Keep", status: "active" });
      d.fields[0]!.label = "Task name";
      const next = await publish(a, p, d);
      expect(next.versionNo).toBe(2);
      const before = await view(a, tr.trackerId, "tracker");
      if (before.view === "tracker")
        expect(before.definition.id).toBe(p.versionId);
      const ids = await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT count(DISTINCT field_id)::int n FROM tracker.field_definition f JOIN tracker.field_identity i ON i.id=f.field_id WHERE f.template_id=${p.templateId}::uuid AND i.stable_key='title'`,
            )
          ).rows,
      );
      expect(ids[0]!.n).toBe(1);
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE tracker.template_version SET state='building' WHERE id=${p.versionId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      await expect(
        withDomainTransaction(a, (t) =>
          t.db.execute(
            sql`UPDATE tracker.field_definition SET label='overwrite' WHERE template_version_id=${p.versionId}::uuid`,
          ),
        ),
      ).rejects.toThrow();
      d.fields = d.fields.slice(1);
      await expect(
        publish(a, { ...p, versionId: next.versionId }, d),
      ).rejects.toThrow();
    }));
  it("archives/restores records without removing history", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, { topic: "Retain" });
      await run(a, {
        operation: "archive",
        kind: "entry",
        id: e.entryId,
        expectedVersion: 1,
        archived: true,
      });
      await expect(
        save(
          a,
          p.trackerId,
          { topic: "No" },
          { entryId: e.entryId, expectedRevisionId: e.revisionId },
        ),
      ).rejects.toThrow("archived");
      await run(a, {
        operation: "archive",
        kind: "entry",
        id: e.entryId,
        expectedVersion: 2,
        archived: false,
      });
      await run(a, {
        operation: "archive",
        kind: "tracker",
        id: p.trackerId,
        expectedVersion: 1,
        archived: true,
      });
      await expect(save(a, p.trackerId, { topic: "No" })).rejects.toThrow(
        "Restore",
      );
      await run(a, {
        operation: "archive",
        kind: "tracker",
        id: p.trackerId,
        expectedVersion: 2,
        archived: false,
      });
      const history = await view(a, e.entryId, "entry");
      if (history.view === "entry") expect(history.history).toHaveLength(1);
    }));
  it("detects invalid conversions and stale confirmations before changing data", () =>
    fixture(async (a) => {
      const p = await preset(a),
        e = await save(a, p.trackerId, {
          topic: "Typed",
          technology: "not numeric",
        });
      const d = structuredClone(presets.learning);
      d.fields.find((f) => f.key === "technology")!.type = "number";
      const next = await publish(a, p, d),
        rules = {
          technology: { from: "technology", conversion: "text_to_number" },
        };
      const invalid = await run(a, {
        operation: "preview",
        trackerId: p.trackerId,
        toVersionId: next.versionId,
        rules,
      });
      expect(invalid.counts).toMatchObject({ invalid: 1, valid: 0 });
      await expect(
        run(a, {
          operation: "confirm",
          migrationId: invalid.migrationId,
          previewHash: invalid.previewHash,
        }),
      ).rejects.toThrow("Resolve invalid");
      const revised = await save(
        a,
        p.trackerId,
        { topic: "Typed", technology: "12.2500" },
        { entryId: e.entryId, expectedRevisionId: e.revisionId },
      );
      const good = await run(a, {
        operation: "preview",
        trackerId: p.trackerId,
        toVersionId: next.versionId,
        rules,
      });
      await save(
        a,
        p.trackerId,
        { topic: "Changed", technology: "12.2500" },
        { entryId: e.entryId, expectedRevisionId: revised.revisionId },
      );
      await expect(
        run(a, {
          operation: "confirm",
          migrationId: good.migrationId,
          previewHash: good.previewHash,
        }),
      ).rejects.toThrow("stale");
    }));
  it("migrates in bounded batches, cancels/resumes partial work and never duplicates revisions", () =>
    fixture(async (a) => {
      const p = await preset(a);
      for (let n = 0; n < 51; n++)
        await save(a, p.trackerId, {
          topic: `Topic ${n}`,
          technology: String(n),
        });
      const d = structuredClone(presets.learning);
      d.fields.find((f) => f.key === "technology")!.type = "number";
      d.fields.push({
        key: "required_note",
        label: "Required note",
        type: "text",
        required: true,
        retired: false,
        validation: {},
        default: "Reviewed",
        options: [],
      });
      const next = await publish(a, p, d);
      const preview = await run(a, {
        operation: "preview",
        trackerId: p.trackerId,
        toVersionId: next.versionId,
        rules: {
          technology: { from: "technology", conversion: "text_to_number" },
        },
      });
      await run(a, {
        operation: "confirm",
        migrationId: preview.migrationId,
        previewHash: preview.previewHash,
      });
      const body = {
          operation: "batch",
          migrationId: preview.migrationId,
          clientCommandId: randomUUID(),
        },
        batch = await command(a, body);
      expect(batch).toMatchObject({
        state: "running",
        migrated: 50,
        remaining: 1,
      });
      expect(await command(a, body)).toEqual(batch);
      await expect(save(a, p.trackerId, { topic: "Blocked" })).rejects.toThrow(
        "paused",
      );
      await expect(
        run(a, {
          operation: "archive",
          kind: "tracker",
          id: p.trackerId,
          expectedVersion: 1,
          archived: true,
        }),
      ).rejects.toThrow("paused");
      await run(a, { operation: "cancel", migrationId: preview.migrationId });
      await expect(
        save(a, p.trackerId, { topic: "Still blocked" }),
      ).rejects.toThrow("paused");
      const partialBundle = await exportWorkspace(a),
        partialReview = await previewWorkspaceRestore(a, {
          clientCommandId: randomUUID(),
          bundle: partialBundle,
        });
      await restoreWorkspace(a, {
        clientCommandId: randomUUID(),
        runId: String(partialReview.runId),
        previewHash: String(partialReview.previewHash),
        confirmation: "replace-private-workspace",
      });
      await expect(
        save(a, p.trackerId, { topic: "Still frozen after restore" }),
      ).rejects.toThrow("paused");
      const partial = await view(a, p.trackerId, "tracker");
      if (partial.view === "tracker")
        expect(partial.tracker.template_version_id).toBe(p.versionId);
      await run(a, {
        operation: "confirm",
        migrationId: preview.migrationId,
        previewHash: preview.previewHash,
      });
      expect(
        await run(a, { operation: "batch", migrationId: preview.migrationId }),
      ).toMatchObject({ state: "completed", migrated: 51, remaining: 0 });
      const final = await view(a, p.trackerId, "tracker");
      if (final.view === "tracker")
        expect(final.tracker.template_version_id).toBe(next.versionId);
      const totals = await withDomainTransaction(
        a,
        async (t) =>
          (
            await t.db.execute(
              sql`SELECT count(*)::int n FROM tracker.entry_revision`,
            )
          ).rows[0],
      );
      expect(totals!.n).toBe(102);
    }));
  it(
    "remaps and explicitly resumes an in-flight partial migration in another private workspace",
    () =>
      fixture(async (a, b) => {
        const p = await preset(a);
        for (let n = 0; n < 51; n++)
          await save(a, p.trackerId, { topic: `Foreign partial ${n}` });
        const d = structuredClone(presets.learning);
        d.fields[0]!.label = "Renamed topic";
        const version = await publish(a, p, d),
          review = await run(a, {
            operation: "preview",
            trackerId: p.trackerId,
            toVersionId: version.versionId,
            rules: {},
          });
        await run(a, {
          operation: "confirm",
          migrationId: review.migrationId,
          previewHash: review.previewHash,
        });
        await run(a, { operation: "batch", migrationId: review.migrationId });
        const bundle = await exportWorkspace(a),
          foreign = await previewWorkspaceRestore(b, {
            clientCommandId: randomUUID(),
            bundle,
          });
        expect(
          await restoreWorkspace(b, {
            clientCommandId: randomUUID(),
            runId: String(foreign.runId),
            previewHash: String(foreign.previewHash),
            confirmation: "replace-private-workspace",
          }),
        ).toMatchObject({ restored: true });
        const ids = remapForeignGraph(bundle, b.workspaceId).map,
          trackerId = ids.get(String(p.trackerId))!,
          migrationId = ids.get(String(review.migrationId))!;
        await expect(
          save(b, trackerId, { topic: "Frozen foreign partial" }),
        ).rejects.toThrow("paused");
        const restored = await view(b, migrationId, "migration");
        if (restored.view !== "migration") throw new Error();
        expect(restored.migration.state).toBe("cancelled");
        await run(b, {
          operation: "confirm",
          migrationId,
          previewHash: review.previewHash,
        });
        expect(await run(b, { operation: "batch", migrationId })).toMatchObject(
          { state: "completed", migrated: 51, remaining: 0 },
        );
        expect(
          (await getTrackerReport(b, { period: "year" })).counts,
        ).toMatchObject({ entries: 51, created: 51, migrationRevisions: 51 });
      }),
    15000,
  );
  it("refuses simultaneous migration plans and wrong-lineage targets", () =>
    fixture(async (a) => {
      const p = await preset(a),
        other = await preset(a, "books");
      await expect(
        run(a, {
          operation: "preview",
          trackerId: p.trackerId,
          toVersionId: other.versionId,
          rules: {},
        }),
      ).rejects.toThrow("lineage");
      const d = structuredClone(presets.learning);
      d.name = "New";
      const next = await publish(a, p, d),
        one = await run(a, {
          operation: "preview",
          trackerId: p.trackerId,
          toVersionId: next.versionId,
          rules: {},
        }),
        two = await run(a, {
          operation: "preview",
          trackerId: p.trackerId,
          toVersionId: next.versionId,
          rules: {},
        });
      const results = await Promise.allSettled([
        run(a, {
          operation: "confirm",
          migrationId: one.migrationId,
          previewHash: one.previewHash,
        }),
        run(a, {
          operation: "confirm",
          migrationId: two.migrationId,
          previewHash: two.previewHash,
        }),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    }));
  it("supports search/status/pagination and complete tracker portability", () =>
    fixture(async (a, b) => {
      const p = await preset(a, "tasks");
      await save(a, p.trackerId, {
        title: "Percent % literal",
        status: "active",
      });
      await save(a, p.trackerId, { title: "Ordinary", status: "planned" });
      const v = await readTrackers(a, {
        view: "tracker",
        id: String(p.trackerId),
        search: "%",
        status: "active",
      });
      if (v.view === "tracker")
        expect(v.entries.map((e) => e.title)).toEqual(["Percent % literal"]);
      await expect(exportWorkspace(a)).resolves.toHaveProperty("manifest");
      await expect(exportWorkspace(b)).resolves.toHaveProperty("manifest");
    }));
});
