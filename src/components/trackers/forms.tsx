"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  definitionSchema,
  type Definition,
  type Field,
  type Value,
} from "@/modules/trackers/domain/tracker";
import type {
  EntryRow,
  TrackerRow,
} from "@/modules/trackers/repositories/trackers";
import { presets } from "@/modules/trackers/domain/presets";
import { trackerControl as control } from "./styles";
export function Label({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {title}
      {children}
    </label>
  );
}
export function useTrackerCommand() {
  const router = useRouter(),
    attempt = useRef<Record<string, unknown> | null>(null),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  async function send(
    body: Record<string, unknown>,
    onSuccess?: (r: Record<string, unknown>) => void,
  ) {
    if (pending) return;
    attempt.current ??= { ...body, clientCommandId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt.current),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500)
          throw new Error(
            "Unconfirmed save. Retry to resolve the same command.",
          );
        attempt.current = null;
        setUncertain(false);
        setError(
          [
            result.message,
            ...Object.values(result.fieldErrors ?? {}).flat(),
          ].join(" "),
        );
        return;
      }
      attempt.current = null;
      setUncertain(false);
      onSuccess?.(result);
      router.refresh();
    } catch {
      setUncertain(true);
      setError(
        "The outcome is unconfirmed. Keep this page open and retry the same command; your submitted values are retained.",
      );
    } finally {
      setPending(false);
    }
  }
  return {
    send,
    pending,
    uncertain,
    error,
    message: (
      <>
        {error && (
          <p role="alert" className="break-words text-sm text-danger">
            {error}
          </p>
        )}
        {pending && <p role="status">Saving…</p>}
      </>
    ),
  };
}
function FieldInput({
  field,
  value,
  set,
}: {
  field: Field;
  value: Value | undefined;
  set: (v: Value) => void;
}) {
  const id = useId(),
    f = field;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {f.label}
        {f.required ? " (required)" : ""}
      </label>
      {f.type === "checkbox" ? (
        <input
          id={id}
          className="size-6"
          type="checkbox"
          checked={value === true}
          onChange={(e) => set(e.target.checked)}
        />
      ) : f.type === "single_select" ? (
        <select
          id={id}
          className={control}
          required={f.required}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value || null)}
        >
          <option value="">Choose…</option>
          {f.options
            .filter((o) => !o.retired || o.key === value)
            .map((o) => (
              <option key={o.key} value={o.key} disabled={o.retired}>
                {o.label}
                {o.retired ? " (retired)" : ""}
              </option>
            ))}
        </select>
      ) : f.type === "text" ? (
        <textarea
          id={id}
          className={control}
          required={f.required}
          maxLength={f.validation.maxLength ?? (f.key === "title" ? 200 : 4000)}
          minLength={f.validation.minLength}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          rows={f.key === "notes" ? 4 : 2}
        />
      ) : (
        <input
          id={id}
          className={control}
          required={f.required}
          type={f.type === "date" ? "date" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value || null)}
        />
      )}
      <span className="text-xs text-muted-foreground">
        {f.type === "date"
          ? "Calendar date; no timezone conversion."
          : f.type === "number"
            ? `Decimal, up to 4 fractional digits.${f.validation.min ? ` Minimum ${f.validation.min}.` : ""}${f.validation.max ? ` Maximum ${f.validation.max}.` : ""}`
            : ""}
      </span>
    </div>
  );
}
export function EntryForm({
  tracker,
  definition,
  entry,
  disabled = false,
}: {
  tracker: TrackerRow;
  definition: Definition;
  entry?: EntryRow;
  disabled?: boolean;
}) {
  const c = useTrackerCommand(),
    router = useRouter(),
    [values, setValues] = useState<Record<string, Value>>(
      () =>
        entry?.values ??
        Object.fromEntries(
          definition.fields
            .filter((f) => !f.retired && f.default !== undefined)
            .map((f) => [f.key, f.default!]),
        ),
    ),
    [reason, setReason] = useState(entry ? "" : "Create entry");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void c.send(
          {
            operation: "save_entry",
            trackerId: tracker.id,
            entryId: entry?.id ?? null,
            expectedRevisionId: entry?.current_revision_id ?? null,
            values,
            reason,
          },
          (r) => router.push(`/trackers/entries/${r.entryId}`),
        );
      }}
    >
      <fieldset
        disabled={disabled || c.pending || c.uncertain}
        className="space-y-4"
      >
        <legend className="mb-3 text-lg font-semibold">
          {entry ? "Edit entry" : "New entry"}
        </legend>
        {definition.fields
          .filter((f) => !f.retired)
          .map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key]}
              set={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
            />
          ))}
        <Label title="Reason for this revision">
          <input
            className={control}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
          />
        </Label>
      </fieldset>
      {c.message}
      <Button type="submit" disabled={disabled || c.pending}>
        {c.uncertain ? "Retry same command" : "Save entry"}
      </Button>
    </form>
  );
}
export function PresetForm() {
  const c = useTrackerCommand(),
    router = useRouter(),
    [preset, setPreset] = useState<keyof typeof presets>("learning"),
    [name, setName] = useState("Learning");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void c.send({ operation: "preset", preset, name }, (r) =>
          router.push(`/trackers/${r.trackerId}`),
        );
      }}
    >
      <fieldset disabled={c.pending || c.uncertain} className="space-y-3">
        <legend className="mb-2 font-semibold">Start from a preset</legend>
        <Label title="Preset">
          <select
            className={control}
            value={preset}
            onChange={(e) => {
              const key = e.target.value as keyof typeof presets;
              setPreset(key);
              setName(presets[key].name);
            }}
          >
            {Object.entries(presets).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </Label>
        <Label title="Tracker name">
          <input
            className={control}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </Label>
      </fieldset>
      {c.message}
      <Button type="submit" disabled={c.pending}>
        {c.uncertain ? "Retry same command" : "Create private tracker"}
      </Button>
    </form>
  );
}
export function ArchiveButton({
  kind,
  id,
  version,
  archived,
}: {
  kind: "entry" | "tracker" | "template";
  id: string;
  version: number;
  archived: boolean;
}) {
  const c = useTrackerCommand();
  return (
    <div className="space-y-2">
      {c.message}
      <Button
        variant="secondary"
        disabled={c.pending}
        onClick={() =>
          void c.send({
            operation: "archive",
            kind,
            id,
            expectedVersion: version,
            archived: !archived,
          })
        }
      >
        {c.uncertain ? "Retry same command" : archived ? "Restore" : "Archive"}
      </Button>
    </div>
  );
}
export function CreateFromTemplate({
  templateId,
  versionId,
  name,
}: {
  templateId: string;
  versionId: string;
  name: string;
}) {
  const c = useTrackerCommand(),
    router = useRouter(),
    [trackerName, setName] = useState(name);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void c.send(
          {
            operation: "create_tracker",
            templateId,
            versionId,
            name: trackerName,
          },
          (r) => router.push(`/trackers/${r.trackerId}`),
        );
      }}
    >
      <Label title="New tracker name">
        <input
          className={control}
          disabled={c.pending || c.uncertain}
          value={trackerName}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </Label>
      {c.message}
      <Button type="submit" disabled={c.pending}>
        {c.uncertain
          ? "Retry same command"
          : "Create tracker from this version"}
      </Button>
    </form>
  );
}
const newField = (key: string, label: string): Field => ({
  key,
  label,
  type: "text",
  required: false,
  retired: false,
  validation: {},
  options: [],
});
export function TemplateBuilder({
  initial,
  templateId = null,
  versionId = null,
}: {
  initial?: Definition;
  templateId?: string | null;
  versionId?: string | null;
}) {
  const c = useTrackerCommand(),
    router = useRouter(),
    [d, setD] = useState<Definition>(
      () =>
        initial ?? {
          name: "My template",
          fields: [{ ...newField("title", "Title"), required: true }],
          titleKey: "title",
          statusKey: null,
          deadlineKey: null,
          completionKey: null,
          completedStatusKeys: [],
        },
    ),
    [reason, setReason] = useState(""),
    [review, setReview] = useState(false),
    [localError, setLocalError] = useState("");
  function update(i: number, patch: Partial<Field>) {
    setD((old) => ({
      ...old,
      fields: old.fields.map((f, n) => (n === i ? { ...f, ...patch } : f)),
    }));
    setReview(false);
  }
  const mapping = (
    key: "titleKey" | "statusKey" | "deadlineKey" | "completionKey",
    title: string,
    type: Field["type"],
  ) => (
    <Label title={title}>
      <select
        className={control}
        value={d[key] ?? ""}
        onChange={(e) => {
          setD({
            ...d,
            [key]: e.target.value || null,
            ...(key === "statusKey" ? { completedStatusKeys: [] } : {}),
          });
          setReview(false);
        }}
      >
        {key !== "titleKey" && <option value="">None</option>}
        {d.fields
          .filter((f) => !f.retired && f.type === type)
          .map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
      </select>
    </Label>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!review) {
          const result = definitionSchema.safeParse(d);
          if (!result.success) {
            setLocalError(result.error.issues.map((i) => i.message).join(" "));
            return;
          }
          setLocalError("");
          setReview(true);
          return;
        }
        void c.send(
          {
            operation: "publish",
            templateId,
            expectedVersionId: versionId,
            definition: d,
            reason,
          },
          (r) => router.push(`/trackers/templates/${r.templateId}`),
        );
      }}
    >
      <fieldset disabled={c.pending || c.uncertain} className="space-y-5">
        <legend className="mb-3 text-lg font-semibold">
          {initial ? "Prepare a new version" : "Create a custom template"}
        </legend>
        <p className="text-sm text-muted-foreground">
          Published versions stay unchanged. Existing trackers migrate only
          after a separate review. Retire fields/options to keep their
          historical meaning.
        </p>
        <Label title="Template name">
          <input
            className={control}
            required
            maxLength={120}
            value={d.name}
            onChange={(e) => {
              setD({ ...d, name: e.target.value });
              setReview(false);
            }}
          />
        </Label>
        {d.fields.map((f, i) => (
          <fieldset
            key={f.key}
            className="min-w-0 space-y-3 rounded-card border border-border p-4"
          >
            <legend className="px-1 font-semibold">
              Field {i + 1}: {f.label}
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              <Label title="Label">
                <input
                  className={control}
                  value={f.label}
                  required
                  maxLength={120}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </Label>
              <Label title="Field identifier (fixed after creation)">
                <input className={control} value={f.key} readOnly />
              </Label>
              <Label title="Field type">
                <select
                  className={control}
                  value={f.type}
                  onChange={(e) =>
                    update(i, {
                      type: e.target.value as Field["type"],
                      validation: {},
                      default: null,
                      options: [],
                    })
                  }
                >
                  {["text", "number", "date", "checkbox", "single_select"].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    ),
                  )}
                </select>
              </Label>
              <Label title="Default">
                {f.type === "checkbox" || f.type === "single_select" ? (
                  <select
                    className={control}
                    value={
                      f.default === undefined || f.default === null
                        ? ""
                        : String(f.default)
                    }
                    onChange={(e) =>
                      update(i, {
                        default:
                          e.target.value === ""
                            ? null
                            : f.type === "checkbox"
                              ? e.target.value === "true"
                              : e.target.value,
                      })
                    }
                  >
                    <option value="">No default</option>
                    {f.type === "checkbox" ? (
                      <>
                        <option value="true">Checked</option>
                        <option value="false">Unchecked</option>
                      </>
                    ) : (
                      f.options
                        .filter((o) => !o.retired)
                        .map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))
                    )}
                  </select>
                ) : (
                  <input
                    className={control}
                    value={
                      typeof f.default === "boolean"
                        ? String(f.default)
                        : (f.default ?? "")
                    }
                    placeholder="Leave empty for no default"
                    onChange={(e) =>
                      update(i, {
                        default: e.target.value === "" ? null : e.target.value,
                      })
                    }
                  />
                )}
              </Label>
            </div>
            <div className="flex flex-wrap gap-5">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                Required
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.retired}
                  onChange={(e) => update(i, { retired: e.target.checked })}
                />
                Retired
              </label>
              <Button
                variant="secondary"
                disabled={i === 0}
                onClick={() => {
                  const fields = [...d.fields];
                  [fields[i - 1], fields[i]] = [fields[i]!, fields[i - 1]!];
                  setD({ ...d, fields });
                  setReview(false);
                }}
              >
                Move up
              </Button>
              <Button
                variant="secondary"
                disabled={i === d.fields.length - 1}
                onClick={() => {
                  const fields = [...d.fields];
                  [fields[i], fields[i + 1]] = [fields[i + 1]!, fields[i]!];
                  setD({ ...d, fields });
                  setReview(false);
                }}
              >
                Move down
              </Button>
            </div>
            {["text", "number", "date"].includes(f.type) && (
              <div className="grid gap-3 md:grid-cols-2">
                {(f.type === "text"
                  ? ["minLength", "maxLength"]
                  : f.type === "number"
                    ? ["min", "max"]
                    : ["earliest", "latest"]
                ).map((key) => (
                  <Label key={key} title={key}>
                    <input
                      className={control}
                      value={String(
                        f.validation[key as keyof Field["validation"]] ?? "",
                      )}
                      onChange={(e) => {
                        const validation = { ...f.validation };
                        if (!e.target.value)
                          delete validation[key as keyof typeof validation];
                        else
                          Object.assign(validation, {
                            [key]:
                              f.type === "text"
                                ? Number(e.target.value)
                                : e.target.value,
                          });
                        update(i, { validation });
                      }}
                    />
                  </Label>
                ))}
              </div>
            )}
            {f.type === "single_select" && (
              <fieldset className="space-y-3">
                <legend>Choices</legend>
                {f.options.map((o, n) => (
                  <div key={o.key} className="grid gap-2 md:grid-cols-3">
                    <Label title={`Choice ${n + 1} identifier`}>
                      <input className={control} value={o.key} readOnly />
                    </Label>
                    <Label title={`Choice ${n + 1} label`}>
                      <input
                        className={control}
                        value={o.label}
                        required
                        maxLength={120}
                        onChange={(e) =>
                          update(i, {
                            options: f.options.map((x, j) =>
                              j === n ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Label>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={o.retired}
                        onChange={(e) =>
                          update(i, {
                            options: f.options.map((x, j) =>
                              j === n ? { ...x, retired: e.target.checked } : x,
                            ),
                          })
                        }
                      />
                      Retired choice
                    </label>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  disabled={f.options.length >= 40}
                  onClick={() =>
                    update(i, {
                      options: [
                        ...f.options,
                        {
                          key: `choice_${crypto.randomUUID().slice(0, 8)}`,
                          label: "New choice",
                          retired: false,
                        },
                      ],
                    })
                  }
                >
                  Add choice
                </Button>
              </fieldset>
            )}
          </fieldset>
        ))}
        <Button
          variant="secondary"
          disabled={d.fields.length >= 30}
          onClick={() => {
            setD({
              ...d,
              fields: [
                ...d.fields,
                newField(
                  `field_${crypto.randomUUID().slice(0, 8)}`,
                  "New field",
                ),
              ],
            });
            setReview(false);
          }}
        >
          Add field
        </Button>
        <div className="grid gap-3 md:grid-cols-2">
          {mapping("titleKey", "Title field", "text")}
          {mapping("statusKey", "Status field", "single_select")}
          {mapping("deadlineKey", "Deadline field", "date")}
          {mapping("completionKey", "Completed checkbox", "checkbox")}
        </div>
        {d.statusKey && (
          <fieldset>
            <legend>Statuses that mean completed</legend>
            {d.fields
              .find((f) => f.key === d.statusKey)
              ?.options.filter((o) => !o.retired)
              .map((o) => (
                <label key={o.key} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.completedStatusKeys.includes(o.key)}
                    onChange={(e) => {
                      setD({
                        ...d,
                        completedStatusKeys: e.target.checked
                          ? [...d.completedStatusKeys, o.key]
                          : d.completedStatusKeys.filter((k) => k !== o.key),
                      });
                      setReview(false);
                    }}
                  />
                  {o.label}
                </label>
              ))}
          </fieldset>
        )}
        <Label title="Reason for publishing">
          <input
            className={control}
            required
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReview(false);
            }}
          />
        </Label>
      </fieldset>
      {localError && (
        <p role="alert" className="text-danger">
          {localError}
        </p>
      )}
      {review && (
        <div role="status" className="rounded-card border border-border p-4">
          Review: {d.name}, {d.fields.filter((f) => !f.retired).length} active
          fields, {d.fields.filter((f) => f.retired).length} retired fields.
          Publishing preserves existing entries on their current versions.
          Choose Publish to confirm this definition.
        </div>
      )}
      {c.message}
      <Button type="submit" disabled={c.pending}>
        {c.uncertain
          ? "Retry same command"
          : review
            ? "Publish reviewed version"
            : "Review version"}
      </Button>
    </form>
  );
}
