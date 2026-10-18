"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import {
  budgetCommandSchema,
  budgetEndDate,
} from "@/modules/planning/domain/budget";
import type { BudgetEvidence } from "@/modules/planning/repositories/budget-repository";
import {
  CardEvidenceCommandReview,
  useCardEvidenceCommand,
} from "./card-evidence-command";
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
const description =
  "Budgets compare limits with posted spending. This command never records income, spending, a transfer or a reservation of funds.";
export function BudgetDefinitionForm({
  categories,
  today,
  initial,
}: {
  categories: { id: string; name: string; archived: boolean }[];
  today: string;
  initial?: BudgetEvidence;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(
      initial
        ? `/money/budgets/${initial.id}`
        : (newId) => `/money/budgets/${newId}`,
      "budgetId",
    );
  function submit(form: HTMLFormElement) {
    try {
      const f = new FormData(form),
        v = (key: string) => String(f.get(key) ?? "").trim(),
        body = budgetCommandSchema.parse({
          operation: "save",
          clientCommandId: crypto.randomUUID(),
          budgetId: initial?.id ?? null,
          expectedVersion: initial?.version ?? null,
          reason: initial ? v("reason") : null,
          fields: {
            categoryId: v("category"),
            startDate: v("start"),
            endDateExclusive: addCalendarDays(v("end"), 1),
            limitMinor: parsePhpAmountToMinorUnits(v("amount")).toString(),
            basis: v("basis"),
            notes: v("notes") || null,
          },
        });
      if (body.operation !== "save") return;
      const c = categories.find((c) => c.id === body.fields.categoryId);
      command.prepare({
        path: "/api/v1/budgets",
        body,
        summary: [
          `${c?.name ?? "Expense category"}: ${formatMoneyMinorUnits("PHP", body.fields.limitMinor)} ${body.fields.basis} spending limit`,
          `${body.fields.startDate} through ${budgetEndDate(body.fields.endDateExclusive)} (inclusive)`,
          body.reason ?? "New explicit category budget",
          body.fields.notes ?? "No additional notes",
        ],
      });
    } catch {
      command.setError(
        "Review the expense category, ordered dates (up to 366 days), exact nonnegative amount and change reason.",
      );
    }
  }
  return (
    <div className="space-y-4">
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !(!!command.pending || command.phase === "confirmed"))
            submit(e.currentTarget);
        }}
      >
        <fieldset
          disabled={
            !ready || !!command.pending || command.phase === "confirmed"
          }
          className="space-y-4"
        >
          <FormField label="Expense category" htmlFor={`${id}-category`}>
            <select
              id={`${id}-category`}
              name="category"
              required
              className={selectClass}
              defaultValue={initial?.category_id ?? ""}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  disabled={c.archived && c.id !== initial?.category_id}
                >
                  {c.name}
                  {c.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Budget start date" htmlFor={`${id}-start`}>
              <Input
                id={`${id}-start`}
                name="start"
                type="date"
                required
                defaultValue={initial?.start_date ?? today}
              />
            </FormField>
            <FormField
              label="Budget end date (inclusive)"
              htmlFor={`${id}-end`}
            >
              <Input
                id={`${id}-end`}
                name="end"
                type="date"
                required
                defaultValue={
                  initial
                    ? budgetEndDate(initial.end_date_exclusive)
                    : addCalendarDays(today, 29)
                }
              />
            </FormField>
          </div>
          <FormField label="Spending limit (PHP)" htmlFor={`${id}-amount`}>
            <Input
              id={`${id}-amount`}
              name="amount"
              inputMode="decimal"
              required
              defaultValue={initial ? exactDecimal(initial.limit_minor) : ""}
            />
          </FormField>
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              Spending basis and notes
            </summary>
            <div className="space-y-4">
              <FormField label="Spending basis" htmlFor={`${id}-basis`}>
                <select
                  id={`${id}-basis`}
                  name="basis"
                  className={selectClass}
                  defaultValue={initial?.basis ?? "net"}
                >
                  <option value="net">Net — includes spending offsets</option>
                  <option value="gross">Gross — before spending offsets</option>
                </select>
              </FormField>
              <p>
                Refunds use their actual recorded dates. Expected recurring
                plans and principal payments are excluded. Zero is a valid
                no-spending limit.
              </p>
              <FormField label="Budget notes" htmlFor={`${id}-notes`}>
                <textarea
                  id={`${id}-notes`}
                  name="notes"
                  maxLength={2000}
                  className={selectClass}
                  defaultValue={initial?.notes ?? ""}
                />
              </FormField>
            </div>
          </details>
          {initial && (
            <FormField
              label="Reason for budget change"
              htmlFor={`${id}-reason`}
            >
              <Input
                id={`${id}-reason`}
                name="reason"
                required
                maxLength={2000}
              />
            </FormField>
          )}
          <Button type="submit">Review budget</Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview
        command={command}
        title="Review budget"
        description={description}
      />
    </div>
  );
}
export function BudgetLifecycleForm({
  budgetId,
  version,
  archived,
}: {
  budgetId: string;
  version: number;
  archived: boolean;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(`/money/budgets/${budgetId}`, "budgetId"),
    operation = archived ? "restore" : "archive";
  return (
    <div className="space-y-4">
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || !!command.pending || command.phase === "confirmed")
            return;
          try {
            const reason = String(
                new FormData(e.currentTarget).get("reason") ?? "",
              ).trim(),
              body = budgetCommandSchema.parse({
                operation,
                clientCommandId: crypto.randomUUID(),
                budgetId,
                expectedVersion: version,
                reason,
              });
            command.prepare({
              path: "/api/v1/budgets",
              body,
              summary: [
                `${archived ? "Restore" : "Archive"} this budget comparison`,
                reason,
                "The recorded period remains protected from conflicting budgets.",
              ],
            });
          } catch {
            command.setError(
              "Record a reason for this budget lifecycle change.",
            );
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
            label={`Reason to ${operation} budget`}
            htmlFor={`${id}-reason`}
          >
            <Input
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={2000}
            />
          </FormField>
          <Button type="submit" variant="secondary">
            Review {operation}
          </Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview
        command={command}
        title="Review budget lifecycle"
        description={description}
      />
    </div>
  );
}
