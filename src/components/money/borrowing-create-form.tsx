"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import {
  borrowingFeeSchema,
  borrowingInstallmentSchema,
  buildBorrowingPlan,
  recordBorrowingBodySchema,
  type ValidatedRecordBorrowing,
} from "@/modules/finance/domain/borrowing";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
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

const positiveDecimal = decimal.refine(
  (value) => BigInt(value) > 0n,
  "Enter an amount greater than zero.",
);

const optionalDecimal = z.union([z.literal("").transform(() => null), decimal]);

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalCategory = z.union([
  z.literal("").transform(() => null),
  z.uuid(),
]);

const formSchema = recordBorrowingBodySchema
  .safeExtend({
    productName: optionalText,

    principalMinor: positiveDecimal,

    actualReceivedMinor: positiveDecimal,

    fees: z.array(
      borrowingFeeSchema.safeExtend({
        amountMinor: positiveDecimal,
        categoryId: optionalCategory,
      }),
    ),

    installments: z.array(
      borrowingInstallmentSchema.safeExtend({
        contractualMinor: positiveDecimal,

        knownPrincipalMinor: optionalDecimal,

        knownInterestMinor: optionalDecimal,

        knownFeeMinor: optionalDecimal,

        notes: optionalText,
      }),
    ),

    reference: optionalText,

    notes: optionalText,
  })
  .transform((input, context) => {
    const result = recordBorrowingBodySchema.safeParse(input);

    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }

      return z.NEVER;
    }

    return result.data;
  });

type Values = z.input<typeof formSchema>;

const resultSchema = z
  .object({
    actionKind: z.literal("borrowing"),

    debtId: z.uuid(),

    actionId: z.uuid(),

    actionRevisionId: z.uuid(),

    scheduleVersionId: z.uuid(),

    financialRevision: z.string().regex(/^\d+$/),
  })
  .strict();

const selectClass = [
  "min-h-11 w-full rounded-control border border-input",
  "bg-surface px-3 py-2 text-base text-foreground",
  "transition-colors duration-(--motion-duration-fast) ease-state",
  "hover:border-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
  "motion-reduce:transition-none",
].join(" ");

const debtTypeLabels = {
  personal_loan: "Personal loan",
  installment_loan: "Installment loan",
  flexible_manual: "Flexible manual obligation",
} as const;

const feeTreatmentLabels = {
  withheld: "Withheld from loan proceeds",
  capitalized: "Added to the debt balance",
} as const;

type Props = {
  currency: string;

  accounts: readonly FinancialAccountListItem[];

  categories: readonly CategoryListItem[];
};

export function BorrowingCreateForm({ currency, accounts, categories }: Props) {
  const router = useRouter();

  const [stage, setStage] = useState<
    "editing" | "reviewing" | "saving" | "unconfirmed" | "saved"
  >("editing");

  const [pending, setPending] = useState<ValidatedRecordBorrowing | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [validationMessages, setValidationMessages] = useState<string[]>([]);

  const reviewRef = useRef<HTMLDivElement>(null);

  const savingRef = useRef(false);

  const expenseCategories = categories.filter(
    (category) => category.kind === "expense" && !category.archived,
  );

  const defaultFeeCategoryId =
    expenseCategories.find((category) => category.code === "transaction_fees")
      ?.categoryId ?? "";

  const form = useForm<Values, unknown, ValidatedRecordBorrowing>({
    resolver: zodResolver(formSchema),

    defaultValues: {
      clientCommandId: "00000000-0000-4000-8000-000000000000",

      name: "",

      lenderName: "",

      productName: "",

      debtType: "personal_loan",

      borrowingDate: "",

      receivingAccountId: accounts[0]?.accountId ?? "",

      principalMinor: "",

      actualReceivedMinor: "",

      fees: [],

      installments: [],

      scheduleReason: "Provider has not supplied installment dates yet.",

      description: "",

      reference: "",

      notes: "",
    },
  });

  const fees = useFieldArray({
    control: form.control,
    name: "fees",
  });

  const installments = useFieldArray({
    control: form.control,
    name: "installments",
  });

  const dirty = form.formState.isDirty || stage === "unconfirmed";

  useEffect(() => {
    if (!dirty || stage === "saved") {
      return;
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();

      event.returnValue = "";
    };

    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !event.target.closest("a[href]")
      ) {
        return;
      }

      const warning =
        stage === "unconfirmed"
          ? "The borrowing save is unconfirmed. Leaving loses the safe retry on this page. Leave anyway?"
          : "Leave and discard this unsaved borrowing?";

      if (!window.confirm(warning)) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);

    document.addEventListener("click", navigate, true);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);

      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, stage]);

  useEffect(() => {
    if (stage === "reviewing") {
      reviewRef.current?.focus();
    }
  }, [stage]);

  const fieldsDisabled = stage !== "editing";

  function field(
    name: FieldPath<Values>,
    label: string,
    options?: {
      type?: string;
      money?: boolean;
      description?: string;
    },
  ) {
    const error = form.getFieldState(name, form.formState).error?.message;

    const id = `borrowing-${name.replaceAll(".", "-")}`;

    const descriptionId = options?.description
      ? `${id}-description`
      : undefined;

    return (
      <FormField
        key={name}
        htmlFor={id}
        label={label}
        description={options?.description}
        descriptionId={descriptionId}
        error={error}
        errorId={`${id}-error`}
      >
        <Input
          {...form.register(name)}
          id={id}
          type={options?.type ?? "text"}
          inputMode={options?.money ? "decimal" : undefined}
          disabled={fieldsDisabled}
          aria-invalid={Boolean(error)}
          aria-describedby={[descriptionId, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ")}
        />
      </FormField>
    );
  }

  async function save(command: ValidatedRecordBorrowing) {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;

    setStage("saving");

    setMessage(null);

    try {
      const response = await fetch("/api/v1/financial-actions", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Accept: "application/json",
        },

        body: JSON.stringify({
          actionKind: "borrowing",

          ...command,
        }),

        cache: "no-store",
      });

      if (response.ok) {
        const result = resultSchema.parse(await response.json());

        setStage("saved");

        setPending(null);

        setMessage(
          "Borrowing saved. Cash proceeds, fees, liability and schedule were recorded together.",
        );

        router.push(`/money/debts/${result.debtId}`);

        router.refresh();

        return;
      }

      /*
       * These outcomes cannot prove that the original transaction failed.
       * Preserve the exact command identity so the user can safely replay it.
       */
      if (
        response.status >= 500 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 409
      ) {
        throw new Error("Unresolved borrowing outcome");
      }

      const problem = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      setStage("editing");

      setPending(null);

      setMessage(
        problem?.message ??
          "The borrowing was rejected. Review the values and try again.",
      );
    } catch {
      setStage("unconfirmed");

      setMessage(
        "We couldn't confirm whether this borrowing was saved. Keep this page open and retry the same save. If your session expired, sign in in another tab first.",
      );
    } finally {
      savingRef.current = false;
    }
  }

  const plan = pending === null ? null : buildBorrowingPlan(pending);

  const selectedAccount =
    pending === null
      ? null
      : (accounts.find(
          (account) => account.accountId === pending.receivingAccountId,
        ) ?? null);

  return (
    <section
      className="rounded-card border border-border bg-card p-5 sm:p-6"
      aria-labelledby="record-borrowing-title"
    >
      <h2 id="record-borrowing-title" className="text-lg font-semibold">
        Record new borrowing
      </h2>

      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Use this when the loan or obligation begins during your tracked history
        and money is actually received now. Borrowed principal is not income.
      </p>

      <form
        className="mt-6 space-y-7"
        noValidate
        onSubmit={form.handleSubmit(
          (values) => {
            setValidationMessages([]);

            setMessage(null);

            setPending({
              ...values,

              clientCommandId: crypto.randomUUID(),
            });

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
        <fieldset disabled={fieldsDisabled} className="space-y-6">
          <legend className="sr-only">Borrowing details</legend>

          <div className="grid gap-5 sm:grid-cols-2">
            {field("name", "Debt name", {
              description:
                "A name you will recognize later, such as Personal loan or Laptop installment.",
            })}

            {field("lenderName", "Lender / provider")}

            {field("productName", "Product name", {
              description: "Optional provider product or plan name.",
            })}

            <FormField
              htmlFor="borrowing-debt-type"
              label="Debt type"
              error={form.formState.errors.debtType?.message}
              errorId="borrowing-debt-type-error"
            >
              <select
                {...form.register("debtType")}
                id="borrowing-debt-type"
                disabled={fieldsDisabled}
                className={selectClass}
              >
                {Object.entries(debtTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>

            {field("borrowingDate", "Borrowing date", {
              type: "date",

              description:
                "The date the new borrowing proceeds were actually received.",
            })}

            <FormField
              htmlFor="borrowing-receiving-account"
              label="Receiving account"
              description="The tracked account where the loan proceeds actually arrived."
              descriptionId="borrowing-receiving-account-description"
              error={form.formState.errors.receivingAccountId?.message}
              errorId="borrowing-receiving-account-error"
            >
              <select
                {...form.register("receivingAccountId")}
                id="borrowing-receiving-account"
                disabled={fieldsDisabled}
                className={selectClass}
                aria-describedby={[
                  "borrowing-receiving-account-description",

                  form.formState.errors.receivingAccountId
                    ? "borrowing-receiving-account-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {accounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.name} —{" "}
                    {formatMoneyMinorUnits(
                      account.currency,
                      account.currentBalanceMinor,
                    )}
                  </option>
                ))}
              </select>
            </FormField>

            {field("principalMinor", `Contractual principal (${currency})`, {
              money: true,

              description:
                "The provider-confirmed principal before borrowing fees.",
            })}

            {field(
              "actualReceivedMinor",
              `Cash actually received (${currency})`,
              {
                money: true,

                description:
                  "What was actually deposited into the receiving account.",
              },
            )}
          </div>

          <section className="space-y-4" aria-labelledby="borrowing-fees-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="borrowing-fees-title" className="font-semibold">
                  Borrowing fees
                </h3>

                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Withheld fees reduce the cash you receive. Capitalized fees
                  increase the recognized debt. Both remain identifiable
                  expenses.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  fees.append({
                    label: "Processing fee",

                    amountMinor: "",

                    treatment: "withheld",

                    categoryId: defaultFeeCategoryId,
                  })
                }
              >
                <Plus aria-hidden="true" className="size-4" />
                Add fee
              </Button>
            </div>

            {fees.fields.length === 0 ? (
              <p className="rounded-control border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
                No borrowing fees entered.
              </p>
            ) : (
              <div className="space-y-4">
                {fees.fields.map((fee, index) => (
                  <div
                    key={fee.id}
                    className="rounded-control border border-border p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">Fee {index + 1}</p>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => fees.remove(index)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Remove
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {field(`fees.${index}.label`, `Fee label ${index + 1}`)}

                      {field(
                        `fees.${index}.amountMinor`,
                        `Fee amount ${index + 1} (${currency})`,
                        {
                          money: true,
                        },
                      )}

                      <FormField
                        htmlFor={`borrowing-fee-treatment-${index}`}
                        label={`Fee treatment ${index + 1}`}
                      >
                        <select
                          {...form.register(`fees.${index}.treatment`)}
                          id={`borrowing-fee-treatment-${index}`}
                          className={selectClass}
                          disabled={fieldsDisabled}
                        >
                          {Object.entries(feeTreatmentLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </FormField>

                      <FormField
                        htmlFor={`borrowing-fee-category-${index}`}
                        label={`Fee category ${index + 1}`}
                        description="Optional reporting category."
                        descriptionId={`borrowing-fee-category-description-${index}`}
                      >
                        <select
                          {...form.register(`fees.${index}.categoryId`)}
                          id={`borrowing-fee-category-${index}`}
                          className={selectClass}
                          disabled={fieldsDisabled}
                          aria-describedby={`borrowing-fee-category-description-${index}`}
                        >
                          <option value="">Uncategorized</option>

                          {expenseCategories.map((category) => (
                            <option
                              key={category.categoryId}
                              value={category.categoryId}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="space-y-4"
            aria-labelledby="borrowing-schedule-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="borrowing-schedule-title" className="font-semibold">
                  Initial manual schedule
                </h3>

                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Optional. Leave this empty if the provider has not supplied
                  due dates. Never estimate a provider schedule.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  installments.append({
                    dueDate: "",

                    contractualMinor: "",

                    knownPrincipalMinor: "",

                    knownInterestMinor: "",

                    knownFeeMinor: "",

                    breakdownComplete: false,

                    notes: "",
                  })
                }
              >
                <Plus aria-hidden="true" className="size-4" />
                Add installment
              </Button>
            </div>

            {installments.fields.map((row, index) => (
              <div
                key={row.id}
                className="rounded-control border border-border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">Installment {index + 1}</p>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => installments.remove(index)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {field(
                    `installments.${index}.dueDate`,
                    `Due date ${index + 1}`,
                    {
                      type: "date",
                    },
                  )}

                  {field(
                    `installments.${index}.contractualMinor`,
                    `Contractual amount ${index + 1} (${currency})`,
                    {
                      money: true,
                    },
                  )}

                  {field(
                    `installments.${index}.knownPrincipalMinor`,
                    `Known principal ${index + 1} (${currency})`,
                    {
                      money: true,
                    },
                  )}

                  {field(
                    `installments.${index}.knownInterestMinor`,
                    `Known interest ${index + 1} (${currency})`,
                    {
                      money: true,
                    },
                  )}

                  {field(
                    `installments.${index}.knownFeeMinor`,
                    `Known fees ${index + 1} (${currency})`,
                    {
                      money: true,
                    },
                  )}

                  <div className="flex min-h-11 items-center">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        {...form.register(
                          `installments.${index}.breakdownComplete`,
                        )}
                        type="checkbox"
                        disabled={fieldsDisabled}
                        className="mt-1 size-4"
                      />

                      <span>
                        Provider supplied a complete principal, interest and fee
                        breakdown for this installment.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="mt-4">
                  <FormField
                    htmlFor={`borrowing-installment-notes-${index}`}
                    label={`Installment notes ${index + 1}`}
                  >
                    <Textarea
                      {...form.register(`installments.${index}.notes`)}
                      id={`borrowing-installment-notes-${index}`}
                      disabled={fieldsDisabled}
                    />
                  </FormField>
                </div>
              </div>
            ))}
          </section>

          <FormField
            htmlFor="borrowing-schedule-reason"
            label="Schedule basis"
            description="Explain what the provider supplied, or why no due dates are available."
            descriptionId="borrowing-schedule-reason-description"
            error={form.formState.errors.scheduleReason?.message}
            errorId="borrowing-schedule-reason-error"
          >
            <Textarea
              {...form.register("scheduleReason")}
              id="borrowing-schedule-reason"
              disabled={fieldsDisabled}
              aria-describedby={[
                "borrowing-schedule-reason-description",

                form.formState.errors.scheduleReason
                  ? "borrowing-schedule-reason-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          {field("description", "Description", {
            description:
              "Describe the actual borrowing, such as Personal loan proceeds received.",
          })}

          {field("reference", "Provider reference", {
            description:
              "Optional loan, application or disbursement reference.",
          })}

          <FormField
            htmlFor="borrowing-notes"
            label="Notes"
            description="Optional context. Do not store passwords, PINs, recovery codes, or other secrets."
            descriptionId="borrowing-notes-description"
            error={form.formState.errors.notes?.message}
            errorId="borrowing-notes-error"
          >
            <Textarea
              {...form.register("notes")}
              id="borrowing-notes"
              disabled={fieldsDisabled}
              aria-describedby={[
                "borrowing-notes-description",

                form.formState.errors.notes ? "borrowing-notes-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </fieldset>

        {validationMessages.length > 0 ? (
          <div
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
          >
            <p className="font-medium">Review these values:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationMessages.map((validationMessage) => (
                <li key={validationMessage}>{validationMessage}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {stage === "reviewing" && pending !== null && plan !== null ? (
          <div
            ref={reviewRef}
            tabIndex={-1}
            role="region"
            aria-label="Borrowing preview"
            className="space-y-5 rounded-control border border-border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
          >
            <div>
              <h3 className="font-semibold">Review borrowing</h3>

              <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                Confirm the exact cash, expense and liability effects before
                saving. Borrowing principal is not income.
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Contractual principal",
                  formatMoneyMinorUnits(
                    currency,
                    plan.principalMinor.toString(),
                  ),
                ],

                [
                  "Cash received",
                  formatMoneyMinorUnits(
                    currency,
                    plan.actualReceivedMinor.toString(),
                  ),
                ],

                [
                  "Withheld fees",
                  formatMoneyMinorUnits(
                    currency,
                    plan.withheldFeeMinor.toString(),
                  ),
                ],

                [
                  "Capitalized fees",
                  formatMoneyMinorUnits(
                    currency,
                    plan.capitalizedFeeMinor.toString(),
                  ),
                ],

                [
                  "Fee expense",
                  formatMoneyMinorUnits(
                    currency,
                    plan.totalFeeExpenseMinor.toString(),
                  ),
                ],

                [
                  "Recognized liability",
                  formatMoneyMinorUnits(
                    currency,
                    plan.recognizedLiabilityMinor.toString(),
                  ),
                ],

                ["Income recognized", "PHP 0.00"],

                [
                  "Receiving account",
                  selectedAccount?.name ?? "Selected account",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-control border border-border bg-surface-subtle px-4 py-3"
                >
                  <dt className="text-xs font-medium text-muted-foreground">
                    {label}
                  </dt>

                  <dd className="numeric-value mt-1 wrap-break-words font-semibold">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {plan.fees.length > 0 ? (
              <div>
                <p className="text-sm font-semibold">Fee details</p>

                <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                  {plan.fees.map((fee, index) => (
                    <li key={index}>
                      <span className="font-medium text-foreground">
                        {fee.label}
                      </span>
                      {" · "}
                      {formatMoneyMinorUnits(
                        currency,
                        fee.amountMinor.toString(),
                      )}
                      {" · "}
                      {feeTreatmentLabels[fee.treatment]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-control border border-border px-4 py-3 text-sm leading-6">
              {pending.installments.length === 0
                ? "No provider due dates supplied. The debt will still be tracked, but scheduled payable remains unknown until a real schedule is entered."
                : `${pending.installments.length} provider-supplied installment${pending.installments.length === 1 ? "" : "s"} will be saved.`}
            </div>
          </div>
        ) : null}

        {stage === "unconfirmed" ? (
          <div
            role="alert"
            className="rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning"
          >
            <div className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
                strokeWidth={1.9}
              />

              <div>
                <p className="font-medium">Save outcome unconfirmed</p>

                <p className="mt-1">{message}</p>
              </div>
            </div>
          </div>
        ) : message ? (
          <p
            role={stage === "saved" ? "status" : "alert"}
            className={
              stage === "saved"
                ? "text-sm font-medium text-success"
                : "rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
            }
          >
            {message}
          </p>
        ) : null}

        {stage === "saved" ? (
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Opening debt details…
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {stage === "editing" ? (
            <Button type="submit">Review borrowing</Button>
          ) : null}

          {stage === "reviewing" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPending(null);

                  setStage("editing");
                }}
              >
                Edit details
              </Button>

              <Button
                type="button"
                onClick={() => {
                  if (pending !== null) {
                    void save(pending);
                  }
                }}
              >
                Confirm borrowing
              </Button>
            </>
          ) : null}

          {stage === "saving" ? (
            <Button
              type="button"
              loading
              loadingLabel="Saving borrowing…"
              disabled
            >
              Saving borrowing…
            </Button>
          ) : null}

          {stage === "unconfirmed" && pending !== null ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void save(pending);
              }}
            >
              Retry same save
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
