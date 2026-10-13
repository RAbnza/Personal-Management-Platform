"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  generateRecurrenceDates,
  planningCommandSchema,
  planningToday,
  type RecurrenceRule,
} from "@/modules/planning/domain/recurrence";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { getRecurringOccurrence } from "@/modules/planning/services/read-recurring";
import {
  useCardEvidenceCommand,
  CardEvidenceCommandReview,
} from "./card-evidence-command";
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
type Choices = { id: string; name: string; kind?: string };
const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const optional = (v: string) => v || null;
function windowFrom(from: string) {
  const projectedThrough = format(
    addDays(new TZDate(`${from}T00:00:00Z`, "UTC"), 90),
    "yyyy-MM-dd",
  );
  return {
    from,
    through: projectedThrough > "2199-12-31" ? "2199-12-31" : projectedThrough,
  };
}
const reviewDescription =
  "Expected occurrences are plans. This command preserves history and never records income, spending or a payment. Actual transactions require separate explicit confirmation.";
export function RecurringDefinitionForm({
  timezone,
  accounts,
  categories,
  initial,
}: {
  timezone: string;
  accounts: Choices[];
  categories: Choices[];
  initial?: {
    id: string;
    name: string;
    kind: "income" | "bill" | "subscription";
    version: number;
    rule: RecurrenceRule;
  };
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(
      initial
        ? `/money/recurring/${initial.id}`
        : (newId: string) => `/money/recurring/${newId}`,
      "obligationId",
    );
  const [frequency, setFrequency] = useState(
      initial?.rule.frequency ?? "monthly",
    ),
    [kind, setKind] = useState(initial?.kind ?? "bill"),
    [preview, setPreview] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false);
  const today = planningToday(timezone);
  function prepare(form: HTMLFormElement) {
    const f = new FormData(form),
      start = value(f, "start"),
      zone = value(f, "timezone"),
      from = start > planningToday(zone) ? start : planningToday(zone);
    const rule = {
      effectiveFrom: start,
      frequency,
      intervalCount: Number(value(f, "interval")),
      weekdays:
        frequency === "weekly" ? f.getAll("weekdays").map(Number) : null,
      dayOfMonth: frequency === "monthly" ? Number(value(f, "day")) : null,
      shortMonthPolicy: frequency === "monthly" ? value(f, "policy") : null,
      endsOn: optional(value(f, "ends")),
      occurrenceLimit: value(f, "limit") ? Number(value(f, "limit")) : null,
      expectedMinor: parsePhpAmountToMinorUnits(value(f, "amount")).toString(),
      currency: "PHP",
      categoryId: optional(value(f, "category")),
      defaultAccountId: optional(value(f, "account")),
      timezone: zone,
    };
    const window = windowFrom(from);
    const parsed = planningCommandSchema.parse({
      operation: "definition",
      clientCommandId: crypto.randomUUID(),
      obligationId: initial?.id ?? null,
      expectedVersion: initial?.version ?? null,
      name: value(f, "name"),
      kind,
      rule,
      window,
      reason: initial ? value(f, "reason") : null,
    });
    if (parsed.operation !== "definition") throw Error("Invalid definition");
    const dates = generateRecurrenceDates(parsed.rule, window);
    setPreview(dates);
    setReviewed(true);
    command.prepare({
      path: "/api/v1/recurring-obligations",
      body: parsed,
      summary: [
        `${parsed.name}: planned ${kind}`,
        `${formatMoneyMinorUnits("PHP", parsed.rule.expectedMinor)} per occurrence; ${frequency}, interval ${parsed.rule.intervalCount}; ${parsed.rule.timezone}`,
        `Generation window ${window.from} through ${window.through}; ${dates.length} expected dates.`,
        initial
          ? `Future revision effective ${start}; linked, completed, skipped and past occurrences remain history.`
          : "No actual financial transaction will be recorded.",
        `Next dates: ${dates.slice(0, 8).join(", ") || "None in this window"}`,
      ],
    });
  }
  const field = (label: string, name: string, child: React.ReactNode) => (
    <FormField label={label} htmlFor={`${id}-${name}`}>
      {child}
    </FormField>
  );
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            prepare(e.currentTarget);
          } catch {
            command.setError(
              "Review the dates, exact amount, recurrence options and reason. Monthly schedules require an explicit short-month policy.",
            );
          }
        }}
      >
        <fieldset
          disabled={
            !ready || !!command.pending || command.phase === "confirmed"
          }
          className="space-y-4 min-w-0"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              "Name",
              "name",
              <Input
                id={`${id}-name`}
                name="name"
                maxLength={200}
                required
                defaultValue={initial?.name ?? ""}
              />,
            )}
            {field(
              "Recurring kind",
              "kind",
              <select
                id={`${id}-kind`}
                name="kind"
                className={selectClass}
                value={kind}
                disabled={!!initial}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="income">Expected income</option>
                <option value="bill">Bill</option>
                <option value="subscription">Subscription</option>
              </select>,
            )}
            {field(
              "Expected amount (PHP)",
              "amount",
              <Input
                id={`${id}-amount`}
                name="amount"
                inputMode="decimal"
                required
                defaultValue={
                  initial ? exactDecimal(initial.rule.expectedMinor) : ""
                }
              />,
            )}
            {field(
              initial
                ? "Future rule effective date"
                : "First rule effective date",
              "start",
              <Input
                id={`${id}-start`}
                type="date"
                name="start"
                required
                defaultValue={today}
              />,
            )}
            {field(
              "Frequency",
              "frequency",
              <select
                id={`${id}-frequency`}
                name="frequency"
                className={selectClass}
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as typeof frequency)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>,
            )}
            {frequency === "monthly" && (
              <>
                {field(
                  "Month day",
                  "day",
                  <Input
                    id={`${id}-day`}
                    type="number"
                    name="day"
                    min={1}
                    max={31}
                    required
                    defaultValue={initial?.rule.dayOfMonth ?? 15}
                  />,
                )}
                {field(
                  "Short-month behavior",
                  "policy",
                  <select
                    id={`${id}-policy`}
                    name="policy"
                    className={selectClass}
                    required
                    defaultValue={initial?.rule.shortMonthPolicy ?? ""}
                  >
                    <option value="">Choose a confirmed rule</option>
                    <option value="last_valid_day">
                      Last valid day in shorter months
                    </option>
                    <option value="skip">Skip shorter months</option>
                  </select>,
                )}
              </>
            )}
          </div>
          {frequency === "weekly" && (
            <fieldset className="space-y-2">
              <legend className="font-medium">Weekdays</legend>
              <div className="flex flex-wrap gap-3">
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day, index) => (
                  <label
                    key={day}
                    className="inline-flex min-h-11 items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      name="weekdays"
                      value={index + 1}
                      defaultChecked={
                        initial?.rule.weekdays?.includes(index + 1) ?? false
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <details className="rounded-control border border-border p-4">
            <summary className="min-h-11 cursor-pointer font-medium">
              Schedule options and suggestions
            </summary>
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {field(
                "Interval",
                "interval",
                <Input
                  id={`${id}-interval`}
                  name="interval"
                  type="number"
                  min={1}
                  max={
                    frequency === "daily"
                      ? 365
                      : frequency === "weekly"
                        ? 52
                        : 120
                  }
                  required
                  defaultValue={initial?.rule.intervalCount ?? 1}
                />,
              )}
              {field(
                "Definition timezone",
                "timezone",
                <Input
                  id={`${id}-timezone`}
                  name="timezone"
                  required
                  defaultValue={initial?.rule.timezone ?? timezone}
                />,
              )}
              {field(
                "Inclusive end date (optional)",
                "ends",
                <Input
                  id={`${id}-ends`}
                  name="ends"
                  type="date"
                  defaultValue={initial?.rule.endsOn ?? ""}
                />,
              )}
              {field(
                "Maximum occurrences (optional)",
                "limit",
                <Input
                  id={`${id}-limit`}
                  name="limit"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={initial?.rule.occurrenceLimit ?? ""}
                />,
              )}
              {field(
                "Suggested account (optional)",
                "account",
                <select
                  id={`${id}-account`}
                  name="account"
                  className={selectClass}
                  defaultValue={initial?.rule.defaultAccountId ?? ""}
                >
                  <option value="">Choose during actual entry</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                "Suggested category (optional)",
                "category",
                <select
                  id={`${id}-category`}
                  name="category"
                  className={selectClass}
                  key={kind}
                  defaultValue={initial?.rule.categoryId ?? ""}
                >
                  <option value="">Choose during actual entry</option>
                  {categories
                    .filter(
                      (c) =>
                        c.kind === (kind === "income" ? "income" : "expense"),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>,
              )}
            </div>
            <p className="pt-3 text-sm text-muted-foreground">
              Suggestions remain editable in actual entry. No weekend or holiday
              adjustment is inferred. Counts restart only for a new reviewed
              rule.
            </p>
          </details>
          {initial &&
            field(
              "Reason for future change",
              "reason",
              <Input
                id={`${id}-reason`}
                name="reason"
                maxLength={2000}
                required
              />,
            )}
          <Button type="submit" disabled={!ready}>
            Preview and review recurrence
          </Button>
        </fieldset>
      </form>
      {reviewed && (
        <section aria-label="Recurrence preview">
          <h2 className="font-semibold">Upcoming date preview</h2>
          <p>
            {preview.slice(0, 8).join(", ") ||
              "No dates in the bounded window."}
          </p>
          {preview.length > 8 && (
            <p>
              {preview.length} dates will be generated; showing the next eight.
            </p>
          )}
        </section>
      )}
      <CardEvidenceCommandReview
        command={command}
        title="Review recurring plan"
        description={reviewDescription}
      />
    </div>
  );
}
export function RecurringDefinitionActions({
  obligationId,
  version,
  today,
}: {
  obligationId: string;
  version: number;
  today: string;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(
      `/money/recurring/${obligationId}`,
      "obligationId",
    );
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        operation = value(f, "operation"),
        body = planningCommandSchema.parse(
          operation === "generate"
            ? {
                operation,
                clientCommandId: crypto.randomUUID(),
                obligationId,
                expectedVersion: version,
                window: {
                  from: value(f, "from"),
                  through: value(f, "through"),
                },
              }
            : {
                operation,
                clientCommandId: crypto.randomUUID(),
                obligationId,
                expectedVersion: version,
                reason: value(f, "reason"),
              },
        );
      command.prepare({
        path: "/api/v1/recurring-obligations",
        body,
        summary: [
          operation === "generate"
            ? `Generate ${value(f, "from")} through ${value(f, "through")} for this definition, preserving existing occurrence identities and overrides.`
            : "Archive the definition and cancel unlinked future plans. Linked and historical evidence remains.",
        ],
      });
    } catch {
      command.setError("Review the bounded dates or archive reason.");
    }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={submit}>
        <fieldset
          disabled={
            !ready || !!command.pending || command.phase === "confirmed"
          }
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="operation" value="generate" />
          <FormField label="Generate from" htmlFor={`${id}-from`}>
            <Input
              id={`${id}-from`}
              name="from"
              type="date"
              defaultValue={today}
              required
            />
          </FormField>
          <FormField label="Generate through" htmlFor={`${id}-through`}>
            <Input
              id={`${id}-through`}
              name="through"
              type="date"
              defaultValue={windowFrom(today).through}
              required
            />
          </FormField>
          <Button type="submit" disabled={!ready}>
            Review generation window
          </Button>
        </fieldset>
      </form>
      <details className="rounded-control border border-border p-4">
        <summary className="min-h-11 cursor-pointer font-medium">
          Archive this definition
        </summary>
        <form onSubmit={submit}>
          <fieldset
            disabled={
              !ready || !!command.pending || command.phase === "confirmed"
            }
            className="space-y-3"
          >
            <input type="hidden" name="operation" value="archive" />
            <FormField label="Archive reason" htmlFor={`${id}-archive`}>
              <Input
                id={`${id}-archive`}
                name="reason"
                maxLength={2000}
                required
              />
            </FormField>
            <Button type="submit" variant="secondary" disabled={!ready}>
              Review archive
            </Button>
          </fieldset>
        </form>
      </details>
      <CardEvidenceCommandReview
        command={command}
        title="Review recurring change"
        description={reviewDescription}
      />
    </div>
  );
}
export function RecurringOccurrenceForm({
  data,
}: {
  data: Awaited<ReturnType<typeof getRecurringOccurrence>>;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(
      `/money/recurring/occurrences/${data.occurrence.id}`,
      "obligationId",
    );
  const [change, setChange] = useState("override");
  const o = data.occurrence,
    editable = o.state === "planned" || o.state === "linked";
  function prepare(body: unknown, summary: string[]) {
    try {
      const parsed = planningCommandSchema.parse(body);
      command.prepare({
        path: "/api/v1/recurring-obligations",
        body: parsed,
        summary,
      });
    } catch {
      command.setError(
        "Review the exact amount, selected actual evidence, dates and reason.",
      );
    }
  }
  return (
    <div className="space-y-5">
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              actual = data.actuals.find(
                (a) => a.actionId === value(f, "action"),
              );
            if (!actual) {
              command.setError(
                "Choose an eligible existing actual transaction.",
              );
              return;
            }
            try {
              prepare(
                {
                  operation: "link",
                  clientCommandId: crypto.randomUUID(),
                  occurrenceId: o.id,
                  expectedVersion: o.version,
                  actionId: actual.actionId,
                  actionRevisionId: actual.actionRevisionId,
                  linkedMinor: parsePhpAmountToMinorUnits(
                    value(f, "amount"),
                  ).toString(),
                },
                [
                  `Link existing ${actual.kind}: ${actual.description} (${actual.transactionDate}).`,
                  `This confirms fulfillment only; no financial posting will be created.`,
                ],
              );
            } catch {
              command.setError("Enter an exact positive PHP amount.");
            }
          }}
        >
          <fieldset
            disabled={
              !ready || !!command.pending || command.phase === "confirmed"
            }
            className="space-y-3"
          >
            <FormField
              label="Existing actual transaction"
              htmlFor={`${id}-action`}
            >
              <select
                id={`${id}-action`}
                name="action"
                defaultValue={
                  data.actuals.some(
                    (a) => a.actionId === data.preferredActionId,
                  )
                    ? data.preferredActionId!
                    : ""
                }
                required
                className={selectClass}
              >
                <option value="">Choose recorded evidence</option>
                {data.actuals.map((a) => (
                  <option key={a.actionId} value={a.actionId}>
                    {a.transactionDate} · {a.description} · available{" "}
                    {formatMoneyMinorUnits("PHP", a.availableMinor)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Amount to link (PHP)"
              htmlFor={`${id}-link-amount`}
            >
              <Input
                id={`${id}-link-amount`}
                name="amount"
                inputMode="decimal"
                defaultValue={exactDecimal(data.remainingMinor)}
                required
              />
            </FormField>
            <Button type="submit" disabled={!ready || !data.actuals.length}>
              Review actual link
            </Button>
          </fieldset>
        </form>
      )}
      {editable && (
        <details className="rounded-control border border-border p-4">
          <summary className="min-h-11 cursor-pointer font-medium">
            Change this occurrence only
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                prepare(
                  {
                    operation: "occurrence",
                    clientCommandId: crypto.randomUUID(),
                    occurrenceId: o.id,
                    expectedVersion: o.version,
                    change,
                    dueDate: change === "override" ? value(f, "date") : null,
                    expectedMinor:
                      change === "override"
                        ? parsePhpAmountToMinorUnits(
                            value(f, "amount"),
                          ).toString()
                        : null,
                    reason: value(f, "reason"),
                  },
                  [
                    `Change ${change} for this occurrence only; original logical date ${o.logical_date} and rule history are retained.`,
                  ],
                );
              } catch {
                command.setError("Review the override amount and date.");
              }
            }}
          >
            <fieldset
              disabled={
                !ready || !!command.pending || command.phase === "confirmed"
              }
              className="space-y-3"
            >
              <FormField label="Occurrence change" htmlFor={`${id}-change`}>
                <select
                  id={`${id}-change`}
                  className={selectClass}
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                >
                  <option value="override">
                    Override date and expected amount
                  </option>
                  <option value="skip">Skip this occurrence</option>
                  <option value="cancel">Cancel this occurrence</option>
                </select>
              </FormField>
              {change === "override" && (
                <>
                  <FormField label="Override due date" htmlFor={`${id}-date`}>
                    <Input
                      id={`${id}-date`}
                      name="date"
                      type="date"
                      required
                      defaultValue={o.due_date}
                    />
                  </FormField>
                  <FormField
                    label="Override expected amount (PHP)"
                    htmlFor={`${id}-amount`}
                  >
                    <Input
                      id={`${id}-amount`}
                      name="amount"
                      inputMode="decimal"
                      required
                      defaultValue={exactDecimal(o.expected_minor)}
                    />
                  </FormField>
                </>
              )}
              <FormField
                label="Occurrence change reason"
                htmlFor={`${id}-reason`}
              >
                <Input
                  id={`${id}-reason`}
                  name="reason"
                  maxLength={2000}
                  required
                />
              </FormField>
              <Button type="submit" variant="secondary" disabled={!ready}>
                Review occurrence change
              </Button>
            </fieldset>
          </form>
        </details>
      )}
      {data.links
        .filter((l) => l.effective)
        .map((l) => (
          <form
            key={l.id}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              prepare(
                {
                  operation: "unlink",
                  clientCommandId: crypto.randomUUID(),
                  linkId: l.id,
                  expectedOccurrenceVersion: o.version,
                  reason: value(f, "reason"),
                },
                [
                  `Reverse the original ${formatMoneyMinorUnits("PHP", l.linkedMinor)} planning link. Actual transaction and immutable link history remain unchanged.`,
                ],
              );
            }}
          >
            <fieldset
              disabled={
                !ready || !!command.pending || command.phase === "confirmed"
              }
              className="space-y-3 rounded-control border border-border p-4"
            >
              <FormField
                label={`Reason to unlink ${formatMoneyMinorUnits("PHP", l.linkedMinor)}`}
                htmlFor={`${id}-${l.id}`}
              >
                <Input
                  id={`${id}-${l.id}`}
                  name="reason"
                  maxLength={2000}
                  required
                />
              </FormField>
              <Button type="submit" variant="secondary" disabled={!ready}>
                Review link reversal
              </Button>
            </fieldset>
          </form>
        ))}
      <CardEvidenceCommandReview
        command={command}
        title="Review recurring occurrence"
        description="Confirm the selected evidence. Linking or unlinking never reposts money. To correct the actual transaction, reverse its planning links first, then explicitly link its corrected revision."
      />
    </div>
  );
}
