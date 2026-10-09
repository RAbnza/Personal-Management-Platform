"use client";

import { useEffect, useRef, useState } from "react";
import { useClientReady } from "@/shared/use-client-ready";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { DebtDetailResult } from "@/modules/finance/domain/debt";
import { liabilityComponents } from "@/modules/finance/domain/debt";
import {
  buildDebtPaymentPreview,
  paymentAccountingComponentSchema,
  paymentDispositionLabels,
  paymentDispositions,
  recordDebtPaymentBodySchema,
  recordDebtPaymentResultSchema,
  type ValidatedDebtPayment,
} from "@/modules/finance/domain/debt-payment";
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
  .transform((value, context) => {
    try {
      return parsePhpAmountToMinorUnits(value).toString();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Amount exceeds the supported limit.",
      });
      return z.NEVER;
    }
  });
const positive = decimal.refine(
  (value) => BigInt(value) > 0n,
  "Enter an amount greater than zero.",
);
const category = z.union([z.literal("").transform(() => null), z.uuid()]);
const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null);
const formSchema = z
  .object({
    ...recordDebtPaymentBodySchema.shape,
    actualPaidMinor: positive,
    contractualMinor: positive,
    externalFeeMinor: decimal,
    components: z.array(
      paymentAccountingComponentSchema.safeExtend({
        amountMinor: positive,
        categoryId: category,
      }),
    ),
    dueAllocations: z
      .array(
        z.object({
          installmentId: z.uuid(),
          amountMinor: z.union([z.literal("").transform(() => "0"), decimal]),
        }),
      )
      .transform((rows) => rows.filter((row) => BigInt(row.amountMinor) > 0n)),
    unappliedContractualMinor: decimal,
    externalFeeCategoryId: category,
    dueAllocationConfirmed: z.boolean(),
    confirmationNote: nullableText,
    reference: nullableText,
    notes: nullableText,
  })
  .transform((input, context) => {
    const parsed = recordDebtPaymentBodySchema.safeParse(input);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues)
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    return z.NEVER;
  });
type Values = z.input<typeof formSchema>;
const selectClass =
  "min-h-11 w-full rounded-control border border-input bg-surface px-3 py-2 text-base text-foreground disabled:bg-surface-subtle";

export function DebtPaymentForm({
  detail,
  accounts,
  categories,
}: {
  detail: DebtDetailResult;
  accounts: readonly FinancialAccountListItem[];
  categories: readonly CategoryListItem[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<
    "editing" | "reviewing" | "saving" | "unconfirmed" | "saved"
  >("editing");
  const [pending, setPending] = useState<ValidatedDebtPayment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const savingRef = useRef(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const allocationRef = useRef<string | null>(null);
  const negativeAcknowledgementRef = useRef<string | null>(null);
  const { debt } = detail;
  const scheduleRef = useRef(debt.scheduleVersionId);
  const activeInstallments = detail.installments.filter(
    (i) => i.disposition === "scheduled" && BigInt(i.remainingMinor) > 0n,
  );
  const form = useForm<Values, unknown, ValidatedDebtPayment>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientCommandId: "00000000-0000-4000-8000-000000000000",
      debtId: debt.debtId,
      payingAccountId: accounts[0]?.accountId ?? "",
      scheduleVersionId: debt.scheduleVersionId ?? "",
      expectedFinancialRevision: detail.financialRevision,
      paymentDate: "",
      actualPaidMinor: "",
      contractualMinor: "",
      externalFeeMinor: "0",
      externalFeeLabel: "Payment fee",
      externalFeeCategoryId: "",
      allocationCertainty: "unresolved",
      components: [
        {
          disposition: "clearing",
          amountMinor: "",
          liabilityComponent: null,
          categoryId: "",
          label: "Pending accounting classification",
        },
      ],
      dueAllocations: activeInstallments.map((i) => ({
        installmentId: i.installmentId,
        amountMinor: "",
      })),
      unappliedContractualMinor: "0",
      dueAllocationConfirmed: false,
      confirmationSource: "user",
      confirmationNote: "",
      acknowledgeNegativeBalance: false,
      description: `Payment for ${debt.name}`,
      reference: "",
      notes: "",
    },
  });
  const components = useFieldArray({
    control: form.control,
    name: "components",
  });
  const values = useWatch({ control: form.control });
  const allocationKey = JSON.stringify([
    values.contractualMinor,
    values.dueAllocations,
    values.unappliedContractualMinor,
    values.confirmationSource,
    detail.financialRevision,
  ]);
  useEffect(() => {
    if (
      allocationRef.current !== null &&
      allocationRef.current !== allocationKey
    )
      form.setValue("dueAllocationConfirmed", false);
    allocationRef.current = allocationKey;
  }, [allocationKey, form]);
  const negativeKey = JSON.stringify([
    values.payingAccountId,
    values.actualPaidMinor,
    detail.financialRevision,
  ]);
  useEffect(() => {
    if (
      negativeAcknowledgementRef.current !== null &&
      negativeAcknowledgementRef.current !== negativeKey
    )
      form.setValue("acknowledgeNegativeBalance", false);
    negativeAcknowledgementRef.current = negativeKey;
  }, [negativeKey, form]);
  useEffect(() => {
    if (stage === "editing") {
      form.setValue("expectedFinancialRevision", detail.financialRevision);
      form.setValue("scheduleVersionId", debt.scheduleVersionId ?? "");
      if (scheduleRef.current !== debt.scheduleVersionId) {
        form.setValue(
          "dueAllocations",
          detail.installments
            .filter(
              (i) =>
                i.disposition === "scheduled" && BigInt(i.remainingMinor) > 0n,
            )
            .map((i) => ({ installmentId: i.installmentId, amountMinor: "" })),
        );
        form.setValue("unappliedContractualMinor", "0");
        form.setValue("dueAllocationConfirmed", false);
        scheduleRef.current = debt.scheduleVersionId;
      }
    }
  }, [
    detail.financialRevision,
    detail.installments,
    debt.scheduleVersionId,
    form,
    stage,
  ]);
  useEffect(() => {
    if (stage === "reviewing") reviewRef.current?.focus();
  }, [stage]);
  const dirty = form.formState.isDirty || stage === "unconfirmed";
  useEffect(() => {
    if (!dirty || stage === "saved") return;
    const unload = (event: BeforeUnloadEvent) => {
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
            ? "Payment save is unconfirmed. Leaving loses the safe retry on this page. Leave anyway?"
            : "Leave and discard this unsaved payment?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, stage]);
  const clientReady = useClientReady();
  const disabled = stage !== "editing" || !clientReady;
  const selectedAccount = accounts.find(
    (a) => a.accountId === (pending?.payingAccountId ?? values.payingAccountId),
  );
  const preview = pending ? buildDebtPaymentPreview(pending) : null;
  const money = (value: string | bigint) =>
    formatMoneyMinorUnits(debt.currency, value.toString());
  let negative = false;
  try {
    negative =
      !!selectedAccount &&
      BigInt(selectedAccount.currentBalanceMinor) -
        parsePhpAmountToMinorUnits(values.actualPaidMinor ?? "0") <
        0n;
  } catch {
    /* Invalid input is handled by the form. */
  }
  const expenseCategories = categories.filter(
    (c) => c.kind === "expense" && !c.archived,
  );
  function field(
    name: FieldPath<Values>,
    label: string,
    options?: { date?: boolean; money?: boolean; description?: string },
  ) {
    const error = form.getFieldState(name, form.formState).error?.message;
    const id = `payment-${name.replaceAll(".", "-")}`;
    return (
      <FormField
        key={name}
        htmlFor={id}
        label={label}
        description={options?.description}
        descriptionId={`${id}-description`}
        error={error}
        errorId={`${id}-error`}
      >
        <Input
          {...form.register(name)}
          id={id}
          type={options?.date ? "date" : "text"}
          inputMode={options?.money ? "decimal" : undefined}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={[
            options?.description ? `${id}-description` : null,
            error ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </FormField>
    );
  }
  function categorySelect(
    name: `components.${number}.categoryId` | "externalFeeCategoryId",
    label: string,
  ) {
    return (
      <FormField htmlFor={`payment-${name}`} label={label}>
        <select
          {...form.register(name)}
          id={`payment-${name}`}
          className={selectClass}
          disabled={disabled}
        >
          <option value="">Uncategorized</option>
          {expenseCategories.map((c) => (
            <option key={c.categoryId} value={c.categoryId}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>
    );
  }
  function propose(allUnapplied: boolean) {
    try {
      let remaining = parsePhpAmountToMinorUnits(
        form.getValues("contractualMinor"),
      );
      const sorted = [...activeInstallments].sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || a.sequenceNo - b.sequenceNo,
      );
      const amounts = new Map<string, bigint>();
      for (const row of sorted) {
        const amount = allUnapplied
          ? 0n
          : remaining < BigInt(row.remainingMinor)
            ? remaining
            : BigInt(row.remainingMinor);
        amounts.set(row.installmentId, amount);
        remaining -= amount;
      }
      const decimalText = (amount: bigint) =>
        `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
      form.setValue(
        "dueAllocations",
        activeInstallments.map((row) => ({
          installmentId: row.installmentId,
          amountMinor: decimalText(amounts.get(row.installmentId) ?? 0n),
        })),
        { shouldDirty: true },
      );
      form.setValue("unappliedContractualMinor", decimalText(remaining), {
        shouldDirty: true,
      });
      form.setValue("dueAllocationConfirmed", false);
      setMessage(
        allUnapplied
          ? "The contractual portion is explicitly unapplied. Confirm this below."
          : "Proposed oldest-due-first allocation is shown below. Review and confirm it; it has not been saved.",
      );
    } catch {
      setMessage(
        "Enter a valid contractual amount before proposing allocations.",
      );
    }
  }
  async function save(command: ValidatedDebtPayment) {
    if (savingRef.current) return;
    savingRef.current = true;
    setStage("saving");
    setMessage(null);
    try {
      const { debtId, ...intent } = command;
      const response = await fetch(`/api/v1/debts/${debtId}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(intent),
        cache: "no-store",
      });
      if (response.ok) {
        const result = recordDebtPaymentResultSchema
          .extend({ actionKind: z.literal("debt_payment") })
          .parse(await response.json());
        if (result.debtId !== command.debtId)
          throw new Error("Unconfirmed payment result");
        setStage("saved");
        setPending(null);
        setMessage("Payment saved. Opening debt details…");
        router.push(`/money/debts/${result.debtId}`);
        router.refresh();
        return;
      }
      const problem = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (problem?.code === "PAYMENT_PREVIEW_STALE") {
        setStage("editing");
        setPending(null);
        form.setValue("dueAllocationConfirmed", false);
        setMessage(
          problem.message ??
            "Financial information changed. Refresh and review the allocations again.",
        );
        router.refresh();
        return;
      }
      if (response.status >= 500 || [401, 403, 409].includes(response.status))
        throw new Error("Unconfirmed save");
      setStage("editing");
      setPending(null);
      setMessage(
        problem?.message ??
          "Payment was rejected. Review the values and try again.",
      );
    } catch {
      setStage("unconfirmed");
      setMessage(
        "We couldn't confirm whether this payment was saved. Keep this page open and check by retrying the same save. If your session expired, sign in in another tab first. Do not enter a new payment for this attempt.",
      );
    } finally {
      savingRef.current = false;
    }
  }
  return (
    <section
      className="rounded-card border border-border bg-card p-5 sm:p-6"
      aria-labelledby="payment-form-title"
    >
      <h2 id="payment-form-title" className="text-lg font-semibold">
        Record debt payment
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Record money already paid to {debt.lenderName}. Principal repayment and
        previously recognized charges are not spending. Due satisfaction is
        confirmed separately from accounting.
      </p>
      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={form.handleSubmit(
          (body) => {
            const reviewErrors: string[] = [];
            for (const allocation of body.dueAllocations) {
              const installment = detail.installments.find(
                (i) =>
                  i.installmentId === allocation.installmentId &&
                  i.disposition === "scheduled",
              );
              if (
                !installment ||
                BigInt(allocation.amountMinor) >
                  BigInt(installment.remainingMinor)
              )
                reviewErrors.push(
                  "An allocation exceeds the current installment remaining amount. Review the allocation or leave the remainder explicitly unapplied.",
                );
            }
            for (const kind of liabilityComponents) {
              const reduction = body.components
                .filter(
                  (c) =>
                    c.disposition === "liability_reduction" &&
                    c.liabilityComponent === kind,
                )
                .reduce((sum, c) => sum + BigInt(c.amountMinor), 0n);
              if (reduction > BigInt(debt.recognizedLiabilityComponents[kind]))
                reviewErrors.push(
                  `The proposed reduction exceeds recognized ${kind} liability. Do not guess a component or expense an already recognized charge.`,
                );
            }
            if (
              selectedAccount &&
              BigInt(selectedAccount.currentBalanceMinor) -
                BigInt(body.actualPaidMinor) <
                0n &&
              !body.acknowledgeNegativeBalance
            )
              reviewErrors.push(
                "Acknowledge the negative tracked account balance before reviewing this actual payment.",
              );
            if (reviewErrors.length) {
              setErrors(reviewErrors);
              setMessage(null);
              return;
            }
            setPending({ ...body, clientCommandId: crypto.randomUUID() });
            setErrors([]);
            setMessage(null);
            setStage("reviewing");
          },
          () => {
            setMessage(null);
            const parsed = formSchema.safeParse(form.getValues());
            setErrors(
              parsed.success
                ? []
                : parsed.error.issues.map(
                    (i) => `${i.path.join(" → ")}: ${i.message}`,
                  ),
            );
          },
        )}
      >
        <fieldset disabled={disabled} className="space-y-6">
          <legend className="sr-only">Payment details</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {field("paymentDate", "Payment date", { date: true })}
            <FormField htmlFor="payment-account" label="Paying account">
              <select
                {...form.register("payingAccountId")}
                id="payment-account"
                className={selectClass}
              >
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name} · {money(a.currentBalanceMinor)}
                  </option>
                ))}
              </select>
            </FormField>
            {field(
              "actualPaidMinor",
              `Actual total cash paid (${debt.currency})`,
              { money: true },
            )}
            {field(
              "contractualMinor",
              `Contractual portion (${debt.currency})`,
              {
                money: true,
                description:
                  "The payment toward the contract, excluding an external payment fee.",
              },
            )}
            {field(
              "externalFeeMinor",
              `External payment fee (${debt.currency})`,
              {
                money: true,
                description: "Excluded from installment satisfaction.",
              },
            )}
            {categorySelect("externalFeeCategoryId", "External fee category")}
            {field("externalFeeLabel", "External fee label")}
            {field("description", "Description")}
            {field("reference", "Payment reference (optional)")}
            {field("notes", "Notes (optional)")}
          </div>
          {negative ? (
            <label className="flex min-h-11 items-start gap-3 rounded-control border border-warning bg-warning-surface p-4 text-sm leading-6">
              <input
                type="checkbox"
                {...form.register("acknowledgeNegativeBalance")}
                className="mt-1 size-5 shrink-0"
              />
              I acknowledge that this payment makes the tracked account
              negative. The account history may be incomplete; I am recording an
              actual payment.
            </label>
          ) : null}
          <section
            aria-labelledby="payment-accounting-title"
            className="space-y-4"
          >
            <h3 id="payment-accounting-title" className="font-semibold">
              Accounting allocation
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Recognized liability: {money(debt.recognizedLiabilityMinor)};
              recognized unclassified liability:{" "}
              {money(debt.unclassifiedLiabilityMinor)}. Do not infer a principal
              or interest split from installment terms. Use clearing when the
              recognized liability reduction itself is unknown.
            </p>
            <FormField htmlFor="payment-certainty" label="Accounting certainty">
              <select
                {...form.register("allocationCertainty")}
                id="payment-certainty"
                className={selectClass}
              >
                <option value="unresolved">
                  Recognized reduction is unresolved (clearing)
                </option>
                <option value="confirmed_total">
                  Confirmed reduction, composition unknown
                </option>
                <option value="known_components">
                  Known or partially known accounting components
                </option>
              </select>
            </FormField>
            {components.fields.map((row, index) => (
              <div
                key={row.id}
                className="space-y-4 rounded-control border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    Accounting component {index + 1}
                  </h4>
                  <Button
                    variant="ghost"
                    onClick={() => components.remove(index)}
                  >
                    Remove component {index + 1}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    htmlFor={`payment-disposition-${index}`}
                    label={`Accounting meaning ${index + 1}`}
                  >
                    <select
                      {...form.register(`components.${index}.disposition`)}
                      id={`payment-disposition-${index}`}
                      className={selectClass}
                      onChange={(event) => {
                        const disposition = event.target
                          .value as Values["components"][number]["disposition"];
                        form.setValue(
                          `components.${index}.disposition`,
                          disposition,
                          { shouldDirty: true },
                        );
                        form.setValue(
                          `components.${index}.liabilityComponent`,
                          disposition === "liability_reduction"
                            ? "unclassified"
                            : null,
                        );
                        form.setValue(`components.${index}.categoryId`, "");
                        form.setValue(
                          `components.${index}.label`,
                          paymentDispositionLabels[disposition],
                        );
                      }}
                    >
                      {paymentDispositions.map((d) => (
                        <option key={d} value={d}>
                          {paymentDispositionLabels[d]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {field(
                    `components.${index}.amountMinor`,
                    `Component amount ${index + 1} (${debt.currency})`,
                    { money: true },
                  )}
                  {field(
                    `components.${index}.label`,
                    `Component label ${index + 1}`,
                  )}
                  {values.components?.[index]?.disposition ===
                  "liability_reduction" ? (
                    <FormField
                      htmlFor={`payment-liability-${index}`}
                      label={`Recognized liability component ${index + 1}`}
                    >
                      <select
                        {...form.register(
                          `components.${index}.liabilityComponent`,
                        )}
                        id={`payment-liability-${index}`}
                        className={selectClass}
                      >
                        {liabilityComponents.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind === "unclassified"
                              ? "Unclassified (composition unknown)"
                              : `Previously recognized ${kind}`}
                            {` · ${money(debt.recognizedLiabilityComponents[kind])}`}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ) : values.components?.[index]?.disposition?.startsWith(
                      "new_",
                    ) ? (
                    categorySelect(
                      `components.${index}.categoryId`,
                      `Expense category ${index + 1}`,
                    )
                  ) : null}
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                components.append({
                  disposition: "clearing",
                  amountMinor: "",
                  liabilityComponent: null,
                  categoryId: "",
                  label: "Pending accounting classification",
                })
              }
            >
              Add accounting component
            </Button>
          </section>
          <section aria-labelledby="payment-due-title" className="space-y-4">
            <h3 id="payment-due-title" className="font-semibold">
              Contractual due allocation
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              These allocations say which obligations were satisfied. They do
              not classify principal, interest, or spending. External fees never
              satisfy an installment.
            </p>
            <div className="flex flex-wrap gap-3">
              {activeInstallments.length > 0 ? (
                <Button variant="secondary" onClick={() => propose(false)}>
                  Propose oldest due first
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => propose(true)}>
                Leave contractual amount unapplied
              </Button>
            </div>
            {activeInstallments.length === 0 ? (
              <p className="text-sm">
                {detail.installments.length === 0
                  ? "No provider due dates supplied. Keep the contractual amount explicitly unapplied; no due date will be invented."
                  : "All supplied obligations are satisfied or cancelled. Keep any additional contractual payment explicitly unapplied."}
              </p>
            ) : null}
            {form.getValues("dueAllocations").map((allocation, index) => {
              const row = detail.installments.find(
                (i) => i.installmentId === allocation.installmentId,
              );
              return row ? (
                <div
                  key={row.installmentId}
                  className="rounded-control border border-border p-4"
                >
                  <p className="mb-3 text-sm">
                    Installment {row.sequenceNo} · {row.dueDate} · Original{" "}
                    {money(row.contractualMinor)} · Remaining{" "}
                    {money(row.remainingMinor)}
                  </p>
                  {field(
                    `dueAllocations.${index}.amountMinor`,
                    `Allocate to installment ${row.sequenceNo} (${debt.currency})`,
                    { money: true },
                  )}
                </div>
              ) : null;
            })}
            {field(
              "unappliedContractualMinor",
              `Explicit unapplied contractual amount (${debt.currency})`,
              { money: true },
            )}
            <FormField
              htmlFor="payment-confirmation-source"
              label="Due satisfaction confirmation"
            >
              <select
                {...form.register("confirmationSource")}
                id="payment-confirmation-source"
                className={selectClass}
              >
                <option value="user">
                  I confirm the contractual allocation
                </option>
                <option value="provider">
                  Provider confirmed the contractual allocation
                </option>
              </select>
            </FormField>
            {field(
              "confirmationNote",
              "Confirmation details / provider reference (optional for user confirmation)",
            )}
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                {...form.register("dueAllocationConfirmed")}
                className="mt-1 size-5 shrink-0"
              />
              I confirm the installment allocations and explicit unapplied
              amount shown above. Accounting uncertainty does not imply due
              satisfaction.
            </label>
          </section>
        </fieldset>
        {errors.length > 0 ? (
          <div
            role="alert"
            className="rounded-control border border-danger bg-danger-surface p-4 text-sm"
          >
            <p className="font-semibold">Review these payment details</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {pending && preview ? (
          <div
            ref={reviewRef}
            tabIndex={-1}
            className="space-y-4 rounded-control border border-border bg-surface-subtle p-5"
            aria-label="Payment review"
          >
            <h3 className="font-semibold">Review exact payment effects</h3>
            <p className="text-sm">
              {debt.name} · {pending.paymentDate} · {pending.description}
            </p>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                [
                  `${selectedAccount?.name ?? "Paying account"} decreases by`,
                  money(preview.actualPaidMinor),
                ],
                [
                  "Account balance after this payment",
                  selectedAccount
                    ? money(
                        BigInt(selectedAccount.currentBalanceMinor) -
                          preview.actualPaidMinor,
                      )
                    : "Unavailable",
                ],
                [
                  "Recognized liability decreases by",
                  money(preview.liabilityReductionMinor),
                ],
                [
                  "New spending (charges and external fee only)",
                  money(preview.newExpenseMinor),
                ],
                [
                  "Clearing / advance, excluded from spendable funds",
                  money(preview.clearingMinor),
                ],
                ["Contractual portion", money(preview.contractualMinor)],
                [
                  "External fee, excluded from dues",
                  money(preview.externalFeeMinor),
                ],
                [
                  "Confirmed due satisfaction",
                  money(preview.dueSatisfiedMinor),
                ],
                [
                  "Explicit unapplied contractual amount",
                  money(preview.unappliedMinor),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="numeric-value mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">
              One actual cash payment of {money(preview.actualPaidMinor)}.
              Principal and previously recognized charges are not expensed
              again.
            </p>
            <ul className="space-y-2 text-sm">
              {pending.components.map((c, index) => (
                <li key={index}>
                  {paymentDispositionLabels[c.disposition]}
                  {c.liabilityComponent
                    ? ` (${c.liabilityComponent})`
                    : ""}: {money(c.amountMinor)} · {c.label}
                </li>
              ))}
            </ul>
            <ul className="space-y-2 text-sm">
              {pending.dueAllocations.map((a) => {
                const i = detail.installments.find(
                  (row) => row.installmentId === a.installmentId,
                );
                return (
                  <li key={a.installmentId}>
                    Installment {i?.sequenceNo} · {i?.dueDate}: allocate{" "}
                    {money(a.amountMinor)}; remaining{" "}
                    {i
                      ? money(BigInt(i.remainingMinor) - BigInt(a.amountMinor))
                      : "unavailable"}
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">
              Confirmation:{" "}
              {pending.confirmationSource === "provider"
                ? "provider, reported by you"
                : "you"}
              {pending.confirmationNote ? ` · ${pending.confirmationNote}` : ""}
              .
            </p>
            {pending.allocationCertainty === "unresolved" ? (
              <p className="text-sm font-medium text-warning">
                Accounting classification remains unresolved. The clearing
                amount does not reduce recognized liability yet.
              </p>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <p
            role={stage === "saved" ? "status" : "alert"}
            className={`rounded-control border p-4 text-sm leading-6 ${stage === "unconfirmed" ? "border-warning bg-warning-surface text-warning" : "border-border"}`}
          >
            {stage === "unconfirmed" ? (
              <strong className="mb-1 block">Save outcome unconfirmed</strong>
            ) : null}
            {message}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          {stage === "editing" ? (
            <Button type="submit" disabled={!clientReady}>
              Review payment
            </Button>
          ) : null}
          {stage === "reviewing" ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setPending(null);
                  setStage("editing");
                }}
              >
                Edit details
              </Button>
              <Button onClick={() => pending && void save(pending)}>
                Confirm payment
              </Button>
            </>
          ) : null}
          {stage === "saving" ? (
            <Button loading loadingLabel="Recording payment…" disabled>
              Recording payment…
            </Button>
          ) : null}
          {stage === "unconfirmed" ? (
            <Button
              variant="secondary"
              onClick={() => pending && void save(pending)}
            >
              Check / retry same save
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
