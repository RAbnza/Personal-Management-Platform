"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  importDebtBodySchema,
  importedInstallmentSchema,
  importDebtResultSchema,
  liabilityComponents,
  openingBreakdownStatus,
  type ValidatedImportDebt,
} from "@/modules/finance/domain/debt";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";

const decimal = z
  .string()
  .trim()
  .max(14)
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
    "Enter an amount with at most two decimal places.",
  )
  .transform((value) => parsePhpAmountToMinorUnits(value).toString());
const optionalDecimal = z.union([z.literal("").transform(() => null), decimal]);
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);
const formSchema = importDebtBodySchema
  .safeExtend({
    productName: optionalText,
    notes: optionalText,
    originalPrincipalMinor: optionalDecimal,
    openingLiabilityMinor: decimal,
    openingComponents: z.array(
      z.object({ kind: z.enum(liabilityComponents), amountMinor: decimal }),
    ),
    installments: z.array(
      importedInstallmentSchema.safeExtend({
        contractualMinor: decimal,
        openingSatisfiedMinor: decimal,
        knownPrincipalMinor: optionalDecimal,
        knownInterestMinor: optionalDecimal,
        knownFeeMinor: optionalDecimal,
        notes: optionalText,
      }),
    ),
  })
  .transform((input, context) => {
    const result = importDebtBodySchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues)
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      return z.NEVER;
    }
    return result.data;
  });
type Values = z.input<typeof formSchema>;
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground";
const typeLabels = {
  personal_loan: "Personal loan",
  installment_loan: "Installment loan",
  financed_purchase: "Financed purchase",
  flexible_manual: "Flexible manual obligation",
};

export function DebtImportForm({ currency }: { currency: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<
    "editing" | "reviewing" | "saving" | "unconfirmed" | "saved"
  >("editing");
  const [pending, setPending] = useState<ValidatedImportDebt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const reviewRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const form = useForm<Values, unknown, ValidatedImportDebt>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientCommandId: "00000000-0000-4000-8000-000000000000",
      name: "",
      lenderName: "",
      productName: "",
      debtType: "personal_loan",
      startDate: "",
      openingCutoffDate: "",
      originalPrincipalMinor: "",
      openingLiabilityMinor: "",
      openingComponents: [{ kind: "unclassified", amountMinor: "" }],
      installments: [],
      scheduleReason:
        "No provider schedule or historical payment details supplied.",
      notes: "",
    },
  });
  const components = useFieldArray({
    control: form.control,
    name: "openingComponents",
  });
  const installments = useFieldArray({
    control: form.control,
    name: "installments",
  });
  const dirty = form.formState.isDirty || stage === "unconfirmed";
  useEffect(() => {
    if (!dirty || stage === "saved") return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !event.target.closest("a[href]")
      )
        return;
      if (
        !window.confirm(
          stage === "unconfirmed"
            ? "The save is unconfirmed. Leaving loses the safe retry on this page. Leave anyway?"
            : "Leave and discard this unsaved debt import?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, stage]);
  useEffect(() => {
    if (stage === "reviewing") reviewRef.current?.focus();
  }, [stage]);
  const disabled = stage !== "editing";
  function field(
    name: FieldPath<Values>,
    label: string,
    type = "text",
    isMoney = false,
  ) {
    const error = form.getFieldState(name, form.formState).error?.message;
    const id = `debt-${name.replaceAll(".", "-")}`;
    return (
      <FormField
        key={name}
        htmlFor={id}
        label={label}
        error={error}
        errorId={`${id}-error`}
      >
        <Input
          {...form.register(name)}
          id={id}
          type={type}
          inputMode={isMoney ? "decimal" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </FormField>
    );
  }
  async function save(command: ValidatedImportDebt) {
    if (savingRef.current) return;
    savingRef.current = true;
    setStage("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/debts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(command),
        cache: "no-store",
      });
      if (response.ok) {
        const result = importDebtResultSchema.parse(await response.json());
        setStage("saved");
        setPending(null);
        setMessage("Debt imported. Opening liability and schedule saved.");
        router.push(`/money/debts/${result.debtId}`);
        router.refresh();
        return;
      }
      // An authentication error after a previously uncertain save does not
      // prove the original transaction rolled back. Retain its exact identity.
      if (
        response.status >= 500 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 409
      )
        throw new Error("Unresolved outcome");
      const problem = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setStage("editing");
      setPending(null);
      setMessage(
        problem?.message ??
          "The import was rejected. Review the values and try again.",
      );
    } catch {
      setStage("unconfirmed");
      setMessage(
        "We couldn't confirm whether this debt was saved. Keep this page open and retry the same save. If your session expired, sign in in another tab first.",
      );
    } finally {
      savingRef.current = false;
    }
  }
  return (
    <section
      className="rounded-card border border-border bg-card p-5 sm:p-6"
      aria-labelledby="import-debt-title"
    >
      <h2 id="import-debt-title" className="text-lg font-semibold">
        Import an existing debt
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Enter the provider-confirmed liability through the end of the cutoff
        date. Normal activity starts the next day. Historical borrowing and
        payments are already included in that baseline.
      </p>
      <form
        className="mt-6 space-y-6"
        noValidate
        onSubmit={form.handleSubmit(
          (values) => {
            setValidationMessages([]);
            setMessage(null);
            setPending({ ...values, clientCommandId: crypto.randomUUID() });
            setStage("reviewing");
          },
          () => {
            const parsed = formSchema.safeParse(form.getValues());
            setValidationMessages(
              parsed.success
                ? []
                : parsed.error.issues.map(
                    (issue) => `${issue.path.join(" → ")}: ${issue.message}`,
                  ),
            );
          },
        )}
      >
        <fieldset disabled={disabled} className="space-y-6">
          <legend className="sr-only">Debt and opening liability</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {field("name", "Debt name")}
            {field("lenderName", "Lender / provider")}
            {field("productName", "Product name (optional)")}
            <FormField htmlFor="debt-type" label="Debt type">
              <select
                {...form.register("debtType")}
                id="debt-type"
                className={selectClass}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            {field("startDate", "Debt start date", "date")}
            {field(
              "openingCutoffDate",
              "Opening cutoff date (end of day)",
              "date",
            )}
            {field(
              "originalPrincipalMinor",
              `Original principal (${currency}, optional)`,
              "text",
              true,
            )}
            {field(
              "openingLiabilityMinor",
              `Recognized opening liability (${currency})`,
              "text",
              true,
            )}
          </div>
          <fieldset className="space-y-4">
            <legend className="font-semibold">
              Opening liability breakdown
            </legend>
            <p className="text-sm text-muted-foreground">
              Enter only confirmed components. Use Unclassified for the unknown
              portion. These amounts must add up to the recognized opening
              liability; scheduled future charges belong below.
            </p>
            {components.fields.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-control border border-border p-4 sm:grid-cols-[1fr_1fr_auto]"
              >
                <FormField
                  htmlFor={`component-${index}`}
                  label={`Component ${index + 1}`}
                >
                  <select
                    {...form.register(`openingComponents.${index}.kind`)}
                    id={`component-${index}`}
                    className={selectClass}
                  >
                    {liabilityComponents.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind[0]!.toUpperCase() + kind.slice(1)}
                      </option>
                    ))}
                  </select>
                </FormField>
                {field(
                  `openingComponents.${index}.amountMinor`,
                  `Component ${index + 1} amount (${currency})`,
                  "text",
                  true,
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={components.fields.length === 1}
                  onClick={() => components.remove(index)}
                >
                  Remove component {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={components.fields.length >= 5}
              onClick={() =>
                components.append({ kind: "principal", amountMinor: "" })
              }
            >
              Add component
            </Button>
          </fieldset>
          <fieldset className="space-y-4">
            <legend className="font-semibold">
              Manual provider schedule (optional)
            </legend>
            <p className="text-sm leading-6 text-muted-foreground">
              No schedule is required. Enter only supplied due dates and
              amounts. “Already satisfied” records history through the cutoff
              and never creates another cash payment. Blank breakdown fields
              mean unknown, not zero. Scheduled future charges do not increase
              recognized liability.
            </p>
            {installments.fields.map((row, index) => (
              <fieldset
                key={row.id}
                className="space-y-4 rounded-control border border-border p-4"
              >
                <legend className="px-1 font-medium">
                  Installment {index + 1}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field(`installments.${index}.dueDate`, "Due date", "date")}
                  {field(
                    `installments.${index}.contractualMinor`,
                    `Contractual amount (${currency})`,
                    "text",
                    true,
                  )}
                  {field(
                    `installments.${index}.openingSatisfiedMinor`,
                    `Already satisfied at cutoff (${currency})`,
                    "text",
                    true,
                  )}
                  {field(
                    `installments.${index}.knownPrincipalMinor`,
                    `Known principal (${currency}, optional)`,
                    "text",
                    true,
                  )}
                  {field(
                    `installments.${index}.knownInterestMinor`,
                    `Known interest (${currency}, optional)`,
                    "text",
                    true,
                  )}
                  {field(
                    `installments.${index}.knownFeeMinor`,
                    `Known fees (${currency}, optional)`,
                    "text",
                    true,
                  )}
                </div>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    {...form.register(
                      `installments.${index}.breakdownComplete`,
                    )}
                  />
                  The installment breakdown is complete (enter all three
                  components, including confirmed zeroes)
                </label>
                {field(
                  `installments.${index}.notes`,
                  "Installment evidence / notes (optional)",
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => installments.remove(index)}
                >
                  Remove installment {index + 1}
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={installments.fields.length >= 360}
              onClick={() => {
                installments.append({
                  dueDate: "",
                  contractualMinor: "",
                  openingSatisfiedMinor: "0.00",
                  knownPrincipalMinor: "",
                  knownInterestMinor: "",
                  knownFeeMinor: "",
                  breakdownComplete: false,
                  notes: "",
                });
                if (installments.fields.length === 0)
                  form.setValue("scheduleReason", "", { shouldDirty: true });
              }}
            >
              Add installment
            </Button>
            {field(
              "scheduleReason",
              "Schedule / historical evidence and limitations",
            )}
          </fieldset>
          <FormField htmlFor="debt-notes" label="Notes (optional)">
            <Textarea {...form.register("notes")} id="debt-notes" />
          </FormField>
        </fieldset>
        {validationMessages.length > 0 ? (
          <div role="alert" className="text-sm text-danger">
            <p>Review these import details:</p>
            <ul className="mt-2 list-disc pl-5">
              {validationMessages.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {pending && stage !== "editing" ? (
          <div
            ref={reviewRef}
            tabIndex={-1}
            className="space-y-3 rounded-control border border-border bg-surface-subtle p-4"
            aria-label="Import preview"
          >
            <h3 className="font-semibold">Review existing debt import</h3>
            <p>
              {pending.name} · {pending.lenderName} · cutoff{" "}
              {pending.openingCutoffDate}
            </p>
            <p>
              Recognized liability:{" "}
              <strong>
                {formatMoneyMinorUnits(currency, pending.openingLiabilityMinor)}
              </strong>
              . Breakdown: {openingBreakdownStatus(pending.openingComponents)}.
            </p>
            <p>
              Cash change: {formatMoneyMinorUnits(currency, "0")}. Income and
              spending: {formatMoneyMinorUnits(currency, "0")}. No historical
              payment is posted.
            </p>
            <p>
              Remaining supplied schedule:{" "}
              {pending.installments.length
                ? formatMoneyMinorUnits(
                    currency,
                    pending.installments
                      .reduce(
                        (sum, row) =>
                          sum +
                          BigInt(row.contractualMinor) -
                          BigInt(row.openingSatisfiedMinor),
                        0n,
                      )
                      .toString(),
                  )
                : "Unknown — no due dates supplied"}
              . This is separate from recognized liability and may include
              future charges.
            </p>
            <p className="text-sm text-muted-foreground">
              {pending.scheduleReason}
            </p>
          </div>
        ) : null}
        {message ? (
          <p
            role={stage === "saved" ? "status" : "alert"}
            className="text-sm leading-6"
          >
            {message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {stage === "editing" ? (
            <Button type="submit">Review import</Button>
          ) : null}
          {stage === "reviewing" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStage("editing");
                  setPending(null);
                }}
              >
                Edit details
              </Button>
              <Button
                type="button"
                onClick={() => pending && void save(pending)}
              >
                Confirm import
              </Button>
            </>
          ) : null}
          {stage === "saving" ? <p role="status">Importing debt…</p> : null}
          {stage === "unconfirmed" ? (
            <Button type="button" onClick={() => pending && void save(pending)}>
              Retry same save
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
