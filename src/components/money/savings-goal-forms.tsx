"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { savingsGoalCommandSchema } from "@/modules/planning/domain/savings-goal";
import type {
  GoalEvidence,
  CashPool,
} from "@/modules/planning/repositories/savings-goal-repository";
import {
  CardEvidenceCommandReview,
  useCardEvidenceCommand,
} from "./card-evidence-command";
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
const description =
  "This is a conceptual reservation or management change. It never creates income, expenses, transfers, new assets or account balances.";
type GoalOption = {
  id: string;
  name: string;
  version: number;
  status: "active" | "completed" | "archived";
};
export function SavingsGoalForm({ initial }: { initial?: GoalEvidence }) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(
      initial ? `/money/goals/${initial.id}` : (id) => `/money/goals/${id}`,
      "goalId",
    ),
    frozen = !ready || !!command.pending || command.phase === "confirmed";
  return (
    <div className="space-y-4">
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (frozen) return;
          try {
            const f = new FormData(e.currentTarget),
              v = (k: string) => String(f.get(k) ?? "").trim(),
              body = savingsGoalCommandSchema.parse({
                operation: "save",
                clientCommandId: crypto.randomUUID(),
                goalId: initial?.id ?? null,
                expectedVersion: initial?.version ?? null,
                reason: initial ? v("reason") : null,
                fields: {
                  name: v("name"),
                  targetMinor: parsePhpAmountToMinorUnits(
                    v("target"),
                  ).toString(),
                  targetDate: v("date") || null,
                  notes: v("notes") || null,
                },
              });
            if (body.operation !== "save") return;
            command.prepare({
              path: "/api/v1/savings-goals",
              body,
              summary: [
                body.fields.name,
                `${formatMoneyMinorUnits("PHP", body.fields.targetMinor)} target`,
                body.fields.targetDate ?? "No target date",
                body.reason ?? "New savings goal",
                body.fields.notes ?? "No additional notes",
              ],
            });
          } catch {
            command.setError(
              "Review the goal name, exact positive target, date and change reason.",
            );
          }
        }}
      >
        <fieldset disabled={frozen} className="space-y-4">
          <FormField label="Goal name" htmlFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              name="name"
              required
              maxLength={200}
              defaultValue={initial?.name ?? ""}
            />
          </FormField>
          <FormField label="Target amount (PHP)" htmlFor={`${id}-target`}>
            <Input
              id={`${id}-target`}
              name="target"
              inputMode="decimal"
              required
              defaultValue={initial ? exactDecimal(initial.target_minor) : ""}
            />
          </FormField>
          <FormField label="Target date (optional)" htmlFor={`${id}-date`}>
            <Input
              id={`${id}-date`}
              name="date"
              type="date"
              min="1900-01-01"
              max="2199-12-31"
              defaultValue={initial?.target_date ?? ""}
            />
          </FormField>
          <FormField label="Goal notes" htmlFor={`${id}-notes`}>
            <textarea
              id={`${id}-notes`}
              name="notes"
              maxLength={2000}
              defaultValue={initial?.notes ?? ""}
              className={`${selectClass} min-h-28`}
            />
          </FormField>
          {initial && (
            <FormField label="Reason for goal change" htmlFor={`${id}-reason`}>
              <Input
                id={`${id}-reason`}
                name="reason"
                required
                maxLength={2000}
              />
            </FormField>
          )}
          <Button type="submit">Review goal</Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview
        command={command}
        title="Review savings goal"
        description={description}
      />
    </div>
  );
}
export function SavingsReservationForm({
  goal,
  accounts,
  financialRevision,
}: {
  goal: GoalEvidence;
  accounts: CashPool[];
  financialRevision: string;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(`/money/goals/${goal.id}`, "goalId"),
    frozen = !ready || !!command.pending || command.phase === "confirmed";
  return (
    <div className="space-y-4">
      <p>
        Enter the total reservation you want on this account, including any
        existing amount. Enter zero to release it. Decreases remain possible
        after a shortfall; increased reservations require eligible cash and an
        active goal.
      </p>
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (frozen) return;
          try {
            const f = new FormData(e.currentTarget),
              body = savingsGoalCommandSchema.parse({
                operation: "reserve",
                clientCommandId: crypto.randomUUID(),
                goalId: goal.id,
                expectedVersion: goal.version,
                expectedFinancialRevision: financialRevision,
                financialAccountId: String(f.get("account") ?? ""),
                reservedMinor: parsePhpAmountToMinorUnits(
                  String(f.get("amount") ?? ""),
                ).toString(),
                reason: String(f.get("reason") ?? ""),
              });
            if (body.operation !== "reserve") return;
            const a = accounts.find(
              (a) => a.financialAccountId === body.financialAccountId,
            );
            command.prepare({
              path: "/api/v1/savings-goals",
              body,
              summary: [
                `${goal.name}: ${formatMoneyMinorUnits("PHP", body.reservedMinor)} total reservation on ${a?.name ?? "Owned account"}`,
                `Current eligible cash ${formatMoneyMinorUnits("PHP", a?.capacityMinor ?? "0")}; all goal reservations ${formatMoneyMinorUnits("PHP", a?.reservedMinor ?? "0")}`,
                body.reason,
              ],
            });
          } catch {
            command.setError(
              "Review the owned account, exact nonnegative reservation and reason.",
            );
          }
        }}
      >
        <fieldset disabled={frozen} className="space-y-4">
          <FormField label="Reservation account" htmlFor={`${id}-account`}>
            <select
              id={`${id}-account`}
              name="account"
              required
              className={selectClass}
              defaultValue=""
            >
              <option value="">Choose an owned cash account</option>
              {accounts.map((a) => (
                <option key={a.financialAccountId} value={a.financialAccountId}>
                  {a.name}
                  {!a.eligible ? " (unavailable; release only)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Total reservation (PHP)" htmlFor={`${id}-amount`}>
            <Input
              id={`${id}-amount`}
              name="amount"
              inputMode="decimal"
              required
            />
          </FormField>
          <FormField
            label="Reason for reservation change"
            htmlFor={`${id}-reason`}
          >
            <Input
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={2000}
            />
          </FormField>
          <Button type="submit">Review reservation</Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview
        command={command}
        title="Review reservation"
        description={description}
      />
    </div>
  );
}
export function SavingsReallocationForm({
  goal,
  accounts,
  targets,
  financialRevision,
}: {
  goal: GoalEvidence;
  accounts: CashPool[];
  targets: GoalOption[];
  financialRevision: string;
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(`/money/goals/${goal.id}`, "goalId"),
    frozen = !ready || !!command.pending || command.phase === "confirmed",
    options = [
      goal,
      ...targets.filter((t) => t.id !== goal.id && t.status === "active"),
    ];
  return (
    <div className="space-y-4">
      <p>
        Reassign a recorded reservation to a different goal or account. This
        does not move money; the destination must have supported cash.
      </p>
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (frozen) return;
          try {
            const f = new FormData(e.currentTarget),
              v = (k: string) => String(f.get(k) ?? ""),
              target = options.find((t) => t.id === v("targetGoal")),
              body = savingsGoalCommandSchema.parse({
                operation: "reallocate",
                clientCommandId: crypto.randomUUID(),
                goalId: goal.id,
                expectedVersion: goal.version,
                expectedFinancialRevision: financialRevision,
                sourceAccountId: v("source"),
                targetAccountId: v("target"),
                targetGoalId: v("targetGoal"),
                expectedTargetVersion: target?.version,
                amountMinor: parsePhpAmountToMinorUnits(v("amount")).toString(),
                reason: v("reason"),
              });
            if (body.operation !== "reallocate") return;
            command.prepare({
              path: "/api/v1/savings-goals",
              body,
              summary: [
                `${formatMoneyMinorUnits("PHP", body.amountMinor)} reservation from ${goal.name} on ${accounts.find((a) => a.financialAccountId === body.sourceAccountId)?.name ?? "Owned source"} to ${target?.name ?? "Destination goal"} on ${accounts.find((a) => a.financialAccountId === body.targetAccountId)?.name ?? "Owned destination"}`,
                body.reason,
              ],
            });
          } catch {
            command.setError(
              "Review distinct source/destination, a positive amount and reason.",
            );
          }
        }}
      >
        <fieldset disabled={frozen} className="space-y-4">
          {[
            ["Source reservation account", "source"],
            ["Destination cash account", "target"],
          ].map(([label, name]) => (
            <FormField key={name} label={label!} htmlFor={`${id}-${name}`}>
              <select
                id={`${id}-${name}`}
                name={name}
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="">Choose an owned account</option>
                {accounts.map((a) => (
                  <option
                    key={a.financialAccountId}
                    value={a.financialAccountId}
                  >
                    {a.name}
                    {a.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </FormField>
          ))}
          <FormField label="Destination savings goal" htmlFor={`${id}-goal`}>
            <select
              id={`${id}-goal`}
              name="targetGoal"
              required
              className={selectClass}
              defaultValue={goal.id}
            >
              {options.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reallocation amount (PHP)" htmlFor={`${id}-amount`}>
            <Input
              id={`${id}-amount`}
              name="amount"
              inputMode="decimal"
              required
            />
          </FormField>
          <FormField label="Reason for reallocation" htmlFor={`${id}-reason`}>
            <Input
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={2000}
            />
          </FormField>
          <Button type="submit">Review reallocation</Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview
        command={command}
        title="Review reallocation"
        description={description}
      />
    </div>
  );
}
export function SavingsLifecycleForm({
  goal,
  operation,
}: {
  goal: GoalEvidence;
  operation: "complete" | "archive" | "reopen";
}) {
  const id = useId(),
    ready = useClientReady(),
    command = useCardEvidenceCommand(`/money/goals/${goal.id}`, "goalId"),
    frozen = !ready || !!command.pending || command.phase === "confirmed";
  return (
    <div className="space-y-4">
      <p>
        {operation === "archive"
          ? "Release every reservation explicitly before archival."
          : operation === "complete"
            ? "Completion records a management milestone and keeps every reservation. It does not create funds."
            : "Reopen the recorded goal while preserving its history and existing reservations."}
      </p>
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          if (frozen) return;
          try {
            const body = savingsGoalCommandSchema.parse({
              operation,
              clientCommandId: crypto.randomUUID(),
              goalId: goal.id,
              expectedVersion: goal.version,
              reason: String(new FormData(e.currentTarget).get("reason") ?? ""),
            });
            command.prepare({
              path: "/api/v1/savings-goals",
              body,
              summary: [`${operation}: ${goal.name}`, body.reason!],
            });
          } catch {
            command.setError("Record a reason for this management milestone.");
          }
        }}
      >
        <fieldset disabled={frozen} className="space-y-3">
          <FormField
            label={`Reason to ${operation} goal`}
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
        title="Review goal milestone"
        description={description}
      />
    </div>
  );
}
