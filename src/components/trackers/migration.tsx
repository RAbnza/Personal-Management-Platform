"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  type Definition,
  type MigrationRules,
} from "@/modules/trackers/domain/tracker";
import type { MigrationRow } from "@/modules/trackers/repositories/trackers";
import { Label, useTrackerCommand } from "./forms";
import { trackerControl as control } from "./styles";
export function MigrationForm({
  trackerId,
  from,
  target,
}: {
  trackerId: string;
  from: Definition;
  target: { id: string; versionNo: number; definition: Definition };
}) {
  const c = useTrackerCommand(),
    router = useRouter(),
    [rules, setRules] = useState<MigrationRules>({});
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void c.send(
          { operation: "preview", trackerId, toVersionId: target.id, rules },
          (r) => router.push(`/trackers/migrations/${r.migrationId}`),
        );
      }}
    >
      <fieldset disabled={c.pending || c.uncertain} className="space-y-4">
        <legend className="mb-3 text-lg font-semibold">
          Review migration to version {target.versionNo}
        </legend>
        <p>
          Old definitions and every prior entry revision remain available. No
          data changes until confirmation and processing. Unmapped new fields
          use their published defaults.
        </p>
        {target.definition.fields
          .filter((f) => !f.retired)
          .map((f) => {
            const rule = rules[f.key],
              source = rule
                ? rule.from
                : from.fields.some((x) => x.key === f.key)
                  ? f.key
                  : null;
            const set = (patch: Partial<MigrationRules[string]>) =>
              setRules((old) => ({
                ...old,
                [f.key]: {
                  from: source,
                  conversion: "copy",
                  ...old[f.key],
                  ...patch,
                },
              }));
            return (
              <fieldset
                key={f.key}
                className="space-y-3 rounded-card border border-border p-3"
              >
                <legend>
                  {f.label} ({f.type}
                  {f.required ? ", required" : ""})
                </legend>
                <Label title="Source field">
                  <select
                    className={control}
                    value={source ?? ""}
                    onChange={(e) =>
                      set({ from: e.target.value || null, value: undefined })
                    }
                  >
                    <option value="">Published default / supplied value</option>
                    {from.fields.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label} ({x.type})
                      </option>
                    ))}
                  </select>
                </Label>
                <Label title="Conversion">
                  <select
                    className={control}
                    value={rule?.conversion ?? "copy"}
                    onChange={(e) =>
                      set({
                        conversion: e.target
                          .value as MigrationRules[string]["conversion"],
                      })
                    }
                  >
                    <option value="copy">Same type</option>
                    <option value="text_to_number">
                      Text → number (strict decimal)
                    </option>
                    <option value="number_to_text">Number → text</option>
                    <option value="text_to_date">
                      Text → date (YYYY-MM-DD)
                    </option>
                  </select>
                </Label>
                {source === null && (
                  <Label title="Value for every entry (empty uses published default)">
                    {f.type === "checkbox" ? (
                      <select
                        className={control}
                        value={
                          rule?.value === undefined ? "" : String(rule.value)
                        }
                        onChange={(e) =>
                          set({
                            value:
                              e.target.value === ""
                                ? undefined
                                : e.target.value === "true",
                          })
                        }
                      >
                        <option value="">Published default</option>
                        <option value="true">Checked</option>
                        <option value="false">Unchecked</option>
                      </select>
                    ) : (
                      <input
                        className={control}
                        value={String(rule?.value ?? "")}
                        onChange={(e) =>
                          set({
                            value:
                              e.target.value === ""
                                ? undefined
                                : f.type === "checkbox"
                                  ? e.target.value === "true"
                                  : e.target.value,
                          })
                        }
                      />
                    )}
                  </Label>
                )}
                {f.type === "single_select" &&
                  from.fields
                    .find((x) => x.key === source)
                    ?.options.map((o) => (
                      <Label key={o.key} title={`Map old choice: ${o.label}`}>
                        <select
                          className={control}
                          value={rule?.optionMap?.[o.key] ?? o.key}
                          onChange={(e) =>
                            set({
                              optionMap: {
                                ...rule?.optionMap,
                                [o.key]: e.target.value,
                              },
                            })
                          }
                        >
                          <option value={o.key}>
                            Keep {o.label} ({o.key})
                          </option>
                          {f.options
                            .filter((x) => !x.retired && x.key !== o.key)
                            .map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.label}
                              </option>
                            ))}
                        </select>
                      </Label>
                    ))}
                <p className="text-xs text-muted-foreground">
                  Default: {String(f.default ?? "none")}. Values no longer
                  active in this version remain in prior revisions.
                </p>
              </fieldset>
            );
          })}
      </fieldset>
      {c.message}
      <Button type="submit" disabled={c.pending}>
        {c.uncertain ? "Retry same command" : "Prepare migration preview"}
      </Button>
    </form>
  );
}
export function MigrationControls({
  migration: m,
}: {
  migration: MigrationRow;
}) {
  const c = useTrackerCommand(),
    [accepted, setAccepted] = useState(false),
    canConfirm =
      ["preview", "cancelled", "failed"].includes(m.state) &&
      m.preview_counts_json.invalid === 0;
  return (
    <div className="space-y-4">
      <p role="status">
        State: {m.state}. {m.migrated_count} of {m.preview_counts_json.total}{" "}
        entries migrated.
      </p>
      <p>
        Confirmed migrations pause entry edits and archival. Process one bounded
        batch at a time. Cancellation retains already committed batches; resume
        this same plan to finish a partially migrated tracker.
      </p>
      {canConfirm && (
        <>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              disabled={c.pending || c.uncertain}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I reviewed the source/target versions, mapping, defaults, affected
            counts and preserved history.
          </label>
          <Button
            disabled={!accepted || c.pending}
            onClick={() =>
              void c.send({
                operation: "confirm",
                migrationId: m.id,
                previewHash: m.preview_hash,
              })
            }
          >
            {c.uncertain
              ? "Retry same command"
              : m.migrated_count
                ? "Resume reviewed migration"
                : "Confirm reviewed migration"}
          </Button>
        </>
      )}
      {["confirmed", "running", "failed"].includes(m.state) && (
        <Button
          disabled={c.pending}
          onClick={() => void c.send({ operation: "batch", migrationId: m.id })}
        >
          {c.uncertain
            ? "Retry same command"
            : "Process next batch (up to 50 entries)"}
        </Button>
      )}
      {!["completed", "cancelled"].includes(m.state) && (
        <Button
          variant="secondary"
          disabled={c.pending || c.uncertain}
          onClick={() =>
            void c.send({ operation: "cancel", migrationId: m.id })
          }
        >
          Cancel further processing
        </Button>
      )}
      {c.message}
      <Link className="text-link underline" href={`/trackers/${m.tracker_id}`}>
        Return to tracker
      </Link>
    </div>
  );
}
