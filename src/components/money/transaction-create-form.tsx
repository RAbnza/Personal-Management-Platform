"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR, parseMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";

const decimalAmountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function parseTwoDecimalAmountToMinorUnits(value: string): bigint {
  if (!decimalAmountPattern.test(value)) {
    throw new TypeError("Invalid two-decimal amount.");
  }

  const [wholePart = "0", fractionalPart = ""] = value.split(".");

  return (
    BigInt(wholePart) * 100n + BigInt(fractionalPart.padEnd(2, "0") || "0")
  );
}

function isValidCalendarDate(value: string): boolean {
  return isCalendarDate(value);
}

function isValidOptionalUuid(value: string): boolean {
  return value === "" || z.uuid().safeParse(value).success;
}

const expenseSplitFormSchema = z.object({
  amount: z.string(),
  categoryId: z.string(),
});

const transactionFormSchema = z
  .object({
    actionKind: z.enum(["income", "expense"]),

    accountId: z.string().refine((value) => z.uuid().safeParse(value).success, {
      message: "Select a financial account.",
    }),

    effectiveDate: z.string().refine(isValidCalendarDate, {
      message: "Enter a valid transaction date.",
    }),

    amount: z
      .string()
      .trim()
      .regex(decimalAmountPattern, {
        message:
          "Enter a positive amount with no more than two decimal places.",
      })
      .refine(
        (value) => {
          if (!decimalAmountPattern.test(value)) {
            return true;
          }

          const amount = parseTwoDecimalAmountToMinorUnits(value);

          return amount > 0n && amount <= MAX_FINANCIAL_COMPONENT_MINOR;
        },
        {
          message:
            "Amount must be greater than zero and within the supported financial limit.",
        },
      ),

    categoryId: z.string().refine(isValidOptionalUuid, {
      message: "Select a valid category.",
    }),

    expenseSplits: z.array(expenseSplitFormSchema).min(1),

    incomeClass: z.enum(["earned", "gift", "reward", "other"]),

    counterpartyName: z.string(),

    description: z
      .string()
      .trim()
      .min(1, "Enter a transaction description.")
      .max(2000, "Description must be 2,000 characters or fewer."),

    reference: z.string(),

    notes: z.string().max(20_000, "Notes must be 20,000 characters or fewer."),
  })
  .superRefine((values, context) => {
    if (values.actionKind !== "expense") {
      return;
    }

    values.expenseSplits.forEach((split, index) => {
      const amount = split.amount.trim();

      if (!decimalAmountPattern.test(amount)) {
        context.addIssue({
          code: "custom",
          path: ["expenseSplits", index, "amount"],
          message:
            "Enter a positive amount with no more than two decimal places.",
        });

        return;
      }

      const amountMinor = parseTwoDecimalAmountToMinorUnits(amount);

      if (amountMinor <= 0n || amountMinor > MAX_FINANCIAL_COMPONENT_MINOR) {
        context.addIssue({
          code: "custom",
          path: ["expenseSplits", index, "amount"],
          message:
            "Category portion must be greater than zero and within the supported financial limit.",
        });
      }

      if (!isValidOptionalUuid(split.categoryId)) {
        context.addIssue({
          code: "custom",
          path: ["expenseSplits", index, "categoryId"],
          message: "Select a valid category.",
        });
      }
    });
  });

type TransactionFormValues = z.infer<typeof transactionFormSchema>;

type IncomePayload = {
  acknowledgeNegativeBalance: boolean;
  actionKind: "income";

  receivingAccountId: string;

  effectiveDate: string;
  amountMinor: string;

  incomeClass: "earned" | "gift" | "reward" | "other";

  categoryId: string | null;

  senderName: string | null;
  sourceLabel: null;

  description: string;
  reference: string | null;
  notes: string | null;
};

type ExpensePayload = {
  acknowledgeNegativeBalance: boolean;
  actionKind: "expense";

  fundingAccountId: string;

  effectiveDate: string;
  purchaseMinor: string;

  splits: Array<{
    amountMinor: string;
    categoryId: string | null;
    memo: null;
  }>;

  merchantName: string | null;

  description: string;
  reference: string | null;
  notes: string | null;
};

type FinancialActionPayload = IncomePayload | ExpensePayload;

type PendingFinancialCommand = {
  clientCommandId: string;

  accountId: string;

  payload: FinancialActionPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

const incomeClassOptions = [
  {
    value: "earned",
    label: "Earned income",
  },
  {
    value: "gift",
    label: "Gift",
  },
  {
    value: "reward",
    label: "Reward / rebate",
  },
  {
    value: "other",
    label: "Other income",
  },
] as const;

async function postFinancialAction(
  command: PendingFinancialCommand,
): Promise<Response> {
  const abort = new AbortController(),
    timeout = setTimeout(() => abort.abort(), 20000);
  try {
    const response = await fetch("/api/v1/financial-actions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientCommandId: command.clientCommandId,
        ...command.payload,
      }),
      cache: "no-store",
      signal: abort.signal,
    });
    if (response.ok) {
      const result = z
        .object({
          actionKind: z.literal(command.payload.actionKind),
          actionId: z.uuid(),
          actionRevisionId: z.uuid(),
          financialRevision: z.string().regex(/^\d+$/),
        })
        .safeParse(await response.json());
      if (!result.success) throw new Error("Save outcome unconfirmed");
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export interface TransactionCreateFormProps {
  currency: string;

  accounts: readonly FinancialAccountListItem[];

  categories: readonly CategoryListItem[];
}

export function TransactionCreateForm({
  currency,
  accounts,
  categories,
}: TransactionCreateFormProps) {
  const router = useRouter();

  const [acknowledgeNegativeBalance, setAcknowledgeNegativeBalance] =
    useState(false);
  const savingRef = useRef(false);
  const [pendingCommand, setPendingCommand] =
    useState<PendingFinancialCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    clearErrors,
    setValue,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),

    defaultValues: {
      actionKind: "expense",

      accountId: accounts[0]?.accountId ?? "",

      effectiveDate: "",

      amount: "",

      categoryId: "",

      expenseSplits: [
        {
          amount: "",
          categoryId: "",
        },
      ],

      incomeClass: "earned",

      counterpartyName: "",

      description: "",

      reference: "",

      notes: "",
    },
  });

  const {
    fields: expenseSplitFields,
    append: appendExpenseSplit,
    remove: removeExpenseSplit,
  } = useFieldArray({
    control,
    name: "expenseSplits",
  });

  const actionKind = useWatch({
    control,
    name: "actionKind",
  });

  const selectedAccountId = useWatch({
    control,
    name: "accountId",
  });

  const enteredAmount = useWatch({
    control,
    name: "amount",
  });

  const watchedExpenseSplits = useWatch({
    control,
    name: "expenseSplits",

    defaultValue: [
      {
        amount: "",
        categoryId: "",
      },
    ],
  });

  /*
   * useWatch values are used directly for rendering below, but an array value
   * is not a suitable effect dependency when the effect itself changes form
   * state. Build a scalar key from only the values relevant to split-total
   * validation so the error is cleared only when those values truly change.
   */
  const expenseSplitAmountKey = watchedExpenseSplits
    .map((split) => split.amount)
    .join("\u0000");

  /*
   * A normal one-category expense should not require entering the purchase
   * amount twice. While there is only one category portion, keep its amount
   * synchronized with the overall purchase amount.
   *
   * As soon as another portion is added, each amount becomes independently
   * editable and must sum exactly to the purchase total.
   */
  useEffect(() => {
    if (actionKind === "expense" && expenseSplitFields.length === 1) {
      setValue("expenseSplits.0.amount", enteredAmount, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [actionKind, enteredAmount, expenseSplitFields.length, setValue]);

  /*
   * Once the user actually edits the purchase amount or category-portion
   * amounts, an earlier total-mismatch message no longer describes the
   * current input. Submission will re-check exact equality.
   *
   * Depend on the scalar amount key instead of the watched array identity so
   * setError/clearErrors cannot create a render/effect loop or immediately
   * erase a newly submitted split-total error.
   */
  useEffect(() => {
    clearErrors("root.splitTotal");
  }, [enteredAmount, expenseSplitAmountKey, clearErrors]);

  const selectedAccount =
    accounts.find((account) => account.accountId === selectedAccountId) ?? null;

  const incomeCategories = categories.filter(
    (category) => category.kind === "income",
  );

  const expenseCategories = categories.filter(
    (category) => category.kind === "expense",
  );

  let expenseExceedsLoadedBalance = false;

  if (
    actionKind === "expense" &&
    selectedAccount &&
    decimalAmountPattern.test(enteredAmount)
  ) {
    const expenseMinor = parseTwoDecimalAmountToMinorUnits(enteredAmount);

    const loadedBalanceMinor = parseMinorUnits(
      selectedAccount.currentBalanceMinor,
    );

    expenseExceedsLoadedBalance = expenseMinor > loadedBalanceMinor;
  }

  const purchaseAmountMinor = decimalAmountPattern.test(enteredAmount)
    ? parseTwoDecimalAmountToMinorUnits(enteredAmount)
    : null;

  const allocatedExpenseMinor = watchedExpenseSplits.reduce((total, split) => {
    const value = split.amount.trim();

    if (!decimalAmountPattern.test(value)) {
      return total;
    }

    return total + parseTwoDecimalAmountToMinorUnits(value);
  }, 0n);

  const remainingExpenseMinor =
    purchaseAmountMinor === null
      ? null
      : purchaseAmountMinor - allocatedExpenseMinor;

  useEffect(() => {
    if (saveState !== "saving" && saveState !== "unconfirmed") return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    const navigation = (e: MouseEvent) => {
      if ((e.target as Element).closest("a[href]")) {
        e.preventDefault();
        setSaveError(
          "Retry the identical command to resolve its save outcome before leaving.",
        );
      }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, [saveState]);
  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeFinancialCommand(command: PendingFinancialCommand) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postFinancialAction(command);

      if (response.ok) {
        setPendingCommand(null);
        setSaveState("saved");

        router.push("/money/accounts");

        return;
      }

      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether this transaction was saved. Keep this page open and retry the same save before recording another transaction.",
        );

        return;
      }

      setPendingCommand(null);
      setSaveState("idle");

      setSaveError(
        "The transaction could not be saved. Review the information and try again.",
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this transaction was saved. Keep this page open and retry the same save before recording another transaction.",
      );
    } finally {
      savingRef.current = false;
    }
  }

  async function onSubmit(values: TransactionFormValues) {
    if (savingRef.current || fieldsDisabled) return;
    const account = accounts.find(
      (item) => item.accountId === values.accountId,
    );

    if (!account) {
      setError("accountId", {
        type: "validate",
        message:
          "The selected account is unavailable. Refresh the page and try again.",
      });

      return;
    }

    if (values.effectiveDate <= account.openingCutoffDate) {
      setError("effectiveDate", {
        type: "validate",
        message: `Transaction date must be after this account's opening balance date (${account.openingCutoffDate}).`,
      });

      return;
    }

    const amountMinor = parseTwoDecimalAmountToMinorUnits(values.amount);

    if (values.actionKind === "expense") {
      const splitTotal = values.expenseSplits.reduce(
        (total, split) =>
          total + parseTwoDecimalAmountToMinorUnits(split.amount.trim()),
        0n,
      );

      if (splitTotal !== amountMinor) {
        setError("root.splitTotal", {
          type: "validate",
          message:
            "Expense category portions must sum exactly to the transaction amount.",
        });

        return;
      }
    }

    const incomeCategoryId =
      values.categoryId === "" ? null : values.categoryId;

    const counterpartyName = values.counterpartyName.trim();

    const reference = values.reference.trim();

    const notes = values.notes.trim();

    const common = {
      acknowledgeNegativeBalance,
      effectiveDate: values.effectiveDate,

      description: values.description.trim(),

      reference: reference.length > 0 ? reference : null,

      notes: notes.length > 0 ? notes : null,
    };

    const payload: FinancialActionPayload =
      values.actionKind === "income"
        ? {
            actionKind: "income",

            receivingAccountId: values.accountId,

            amountMinor: amountMinor.toString(),

            incomeClass: values.incomeClass,

            categoryId: incomeCategoryId,

            senderName: counterpartyName.length > 0 ? counterpartyName : null,

            sourceLabel: null,

            ...common,
          }
        : {
            actionKind: "expense",

            fundingAccountId: values.accountId,

            purchaseMinor: amountMinor.toString(),

            splits: values.expenseSplits.map((split) => ({
              amountMinor: parseTwoDecimalAmountToMinorUnits(
                split.amount.trim(),
              ).toString(),

              categoryId: split.categoryId === "" ? null : split.categoryId,

              memo: null,
            })),

            merchantName: counterpartyName.length > 0 ? counterpartyName : null,

            ...common,
          };

    const command: PendingFinancialCommand = {
      clientCommandId: crypto.randomUUID(),

      accountId: values.accountId,

      payload,
    };

    setPendingCommand(command);

    await executeFinancialCommand(command);
  }

  async function retryUnconfirmedSave() {
    if (!pendingCommand) {
      setSaveState("idle");

      setSaveError(
        "The previous save can no longer be retried safely. Reload the page before continuing.",
      );

      return;
    }

    await executeFinancialCommand(pendingCommand);
  }

  return (
    <section
      aria-labelledby="record-transaction-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div>
        <p className="text-xs font-medium text-link">Money</p>

        <h2
          id="record-transaction-title"
          className="mt-1 text-lg font-semibold text-foreground"
        >
          Record a transaction
        </h2>

        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
          Record money that was actually received or spent. Planned or expected
          amounts do not belong here until the real financial activity occurs.
        </p>
      </div>

      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        onChangeCapture={(event) => {
          if (!(event.target as HTMLElement).hasAttribute("data-negative-ack"))
            setAcknowledgeNegativeBalance(false);
        }}
        onClickCapture={(event) => {
          if (
            saveState === "idle" &&
            (event.target as Element).closest('button[type="button"]')
          )
            setAcknowledgeNegativeBalance(false);
        }}
      >
        <fieldset disabled={fieldsDisabled} className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">
            Transaction type
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
              <input {...register("actionKind")} type="radio" value="expense" />

              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Expense
                </span>

                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Money actually spent from one account.
                </span>
              </span>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
              <input {...register("actionKind")} type="radio" value="income" />

              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Income
                </span>

                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Money actually received into one account.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="transaction-account"
            label={
              actionKind === "income" ? "Receiving account" : "Funding account"
            }
            description={
              actionKind === "income"
                ? "Choose where the money was actually received."
                : "Choose the account that actually paid for the expense."
            }
            descriptionId="transaction-account-description"
            error={errors.accountId?.message}
            errorId="transaction-account-error"
          >
            <select
              {...register("accountId")}
              id="transaction-account"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.accountId)}
              aria-describedby={[
                "transaction-account-description",
                errors.accountId ? "transaction-account-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              className={[
                "min-h-11 w-full rounded-control border border-input",
                "bg-surface px-3 py-2 text-base text-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:border-ring",
                "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                "motion-reduce:transition-none",
              ].join(" ")}
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

          <FormField
            htmlFor="transaction-date"
            label="Transaction date"
            description={
              selectedAccount
                ? `Must be after ${selectedAccount.openingCutoffDate}, the account's opening balance date.`
                : undefined
            }
            descriptionId="transaction-date-description"
            error={errors.effectiveDate?.message}
            errorId="transaction-date-error"
          >
            <Input
              {...register("effectiveDate")}
              id="transaction-date"
              type="date"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.effectiveDate)}
              aria-describedby={[
                selectedAccount ? "transaction-date-description" : null,
                errors.effectiveDate ? "transaction-date-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="transaction-amount"
            label={`Amount (${currency})`}
            error={errors.amount?.message}
            errorId="transaction-amount-error"
          >
            <Input
              {...register("amount")}
              id="transaction-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={
                errors.amount ? "transaction-amount-error" : undefined
              }
              className="numeric-value"
            />
          </FormField>

          {actionKind === "income" ? (
            <FormField
              htmlFor="transaction-category"
              label="Category"
              description="Optional. Categories affect reporting, not the account balance itself."
              descriptionId="transaction-category-description"
              error={errors.categoryId?.message}
              errorId="transaction-category-error"
            >
              <select
                {...register("categoryId")}
                id="transaction-category"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.categoryId)}
                aria-describedby={[
                  "transaction-category-description",
                  errors.categoryId ? "transaction-category-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                className={[
                  "min-h-11 w-full rounded-control border border-input",
                  "bg-surface px-3 py-2 text-base text-foreground",
                  "transition-colors duration-(--motion-duration-fast) ease-state",
                  "hover:border-ring",
                  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                <option value="">Uncategorized</option>

                {incomeCategories.map((category) => (
                  <option key={category.categoryId} value={category.categoryId}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          {actionKind === "income" ? (
            <FormField
              htmlFor="transaction-income-class"
              label="Income type"
              description="Classify what the receipt means rather than assuming every incoming amount is salary."
              descriptionId="transaction-income-class-description"
              error={errors.incomeClass?.message}
              errorId="transaction-income-class-error"
            >
              <select
                {...register("incomeClass")}
                id="transaction-income-class"
                disabled={fieldsDisabled}
                aria-describedby="transaction-income-class-description"
                className={[
                  "min-h-11 w-full rounded-control border border-input",
                  "bg-surface px-3 py-2 text-base text-foreground",
                  "transition-colors duration-(--motion-duration-fast) ease-state",
                  "hover:border-ring",
                  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                {incomeClassOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          <FormField
            htmlFor="transaction-counterparty"
            label={actionKind === "income" ? "Sender / source" : "Merchant"}
            description="Optional descriptive metadata. This does not determine where the money is held."
            descriptionId="transaction-counterparty-description"
          >
            <Input
              {...register("counterpartyName")}
              id="transaction-counterparty"
              type="text"
              autoComplete="off"
              disabled={fieldsDisabled}
              aria-describedby="transaction-counterparty-description"
            />
          </FormField>
        </div>

        {actionKind === "expense" ? (
          <fieldset
            disabled={fieldsDisabled}
            className="space-y-4 rounded-control border border-border bg-surface-subtle p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <legend className="text-sm font-semibold text-foreground">
                  Expense categories
                </legend>

                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Split one purchase across categories without creating another
                  account deduction. Every portion must add up exactly to the
                  transaction amount.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                disabled={fieldsDisabled}
                onClick={() => {
                  appendExpenseSplit({
                    amount: "",
                    categoryId: "",
                  });
                }}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.9} />
                Add category split
              </Button>
            </div>

            <div className="space-y-3">
              {expenseSplitFields.map((field, index) => {
                const amountError =
                  errors.expenseSplits?.[index]?.amount?.message;

                const categoryError =
                  errors.expenseSplits?.[index]?.categoryId?.message;

                const hasMultiple = expenseSplitFields.length > 1;

                return (
                  <div
                    key={field.id}
                    className="grid gap-4 rounded-control border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]"
                  >
                    <FormField
                      htmlFor={`expense-split-category-${index}`}
                      label={hasMultiple ? `Category ${index + 1}` : "Category"}
                      description={
                        hasMultiple
                          ? undefined
                          : "Optional. Add another category split when one purchase belongs to more than one category."
                      }
                      descriptionId={`expense-split-category-description-${index}`}
                      error={categoryError}
                      errorId={`expense-split-category-error-${index}`}
                    >
                      <select
                        {...register(`expenseSplits.${index}.categoryId`)}
                        id={`expense-split-category-${index}`}
                        disabled={fieldsDisabled}
                        aria-invalid={Boolean(categoryError)}
                        aria-describedby={[
                          !hasMultiple
                            ? `expense-split-category-description-${index}`
                            : null,
                          categoryError
                            ? `expense-split-category-error-${index}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        className={[
                          "min-h-11 w-full rounded-control border border-input",
                          "bg-surface px-3 py-2 text-base text-foreground",
                          "transition-colors duration-(--motion-duration-fast) ease-state",
                          "hover:border-ring",
                          "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                          "motion-reduce:transition-none",
                        ].join(" ")}
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

                    <FormField
                      htmlFor={`expense-split-amount-${index}`}
                      label={
                        hasMultiple
                          ? `Portion ${index + 1} amount (${currency})`
                          : `Category amount (${currency})`
                      }
                      description={
                        hasMultiple
                          ? undefined
                          : "With one category, this automatically uses the full transaction amount."
                      }
                      descriptionId={`expense-split-amount-description-${index}`}
                      error={amountError}
                      errorId={`expense-split-amount-error-${index}`}
                    >
                      <Input
                        {...register(`expenseSplits.${index}.amount`)}
                        id={`expense-split-amount-${index}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        readOnly={!hasMultiple}
                        disabled={fieldsDisabled}
                        aria-invalid={Boolean(amountError)}
                        aria-describedby={[
                          !hasMultiple
                            ? `expense-split-amount-description-${index}`
                            : null,
                          amountError
                            ? `expense-split-amount-error-${index}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        className="numeric-value"
                      />
                    </FormField>

                    {hasMultiple ? (
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={fieldsDisabled}
                          aria-label={`Remove category portion ${index + 1}`}
                          onClick={() => {
                            removeExpenseSplit(index);
                          }}
                        >
                          <Trash2
                            aria-hidden="true"
                            className="size-4"
                            strokeWidth={1.9}
                          />
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {purchaseAmountMinor !== null && purchaseAmountMinor > 0n ? (
              <div
                role="status"
                className="rounded-control border border-border bg-surface px-4 py-3 text-sm leading-6"
              >
                <p className="text-muted-foreground">
                  Allocated{" "}
                  <span className="numeric-value font-medium text-foreground">
                    {formatMoneyMinorUnits(
                      currency,
                      allocatedExpenseMinor.toString(),
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="numeric-value font-medium text-foreground">
                    {formatMoneyMinorUnits(
                      currency,
                      purchaseAmountMinor.toString(),
                    )}
                  </span>
                  .
                </p>

                {remainingExpenseMinor === 0n ? (
                  <p className="mt-1 font-medium text-success">
                    Category portions match the purchase amount exactly.
                  </p>
                ) : remainingExpenseMinor !== null &&
                  remainingExpenseMinor > 0n ? (
                  <p className="mt-1 text-muted-foreground">
                    Remaining:{" "}
                    <span className="numeric-value font-medium text-foreground">
                      {formatMoneyMinorUnits(
                        currency,
                        remainingExpenseMinor.toString(),
                      )}
                    </span>
                  </p>
                ) : remainingExpenseMinor !== null ? (
                  <p className="mt-1 text-danger">
                    Over by{" "}
                    <span className="numeric-value font-medium">
                      {formatMoneyMinorUnits(
                        currency,
                        (-remainingExpenseMinor).toString(),
                      )}
                    </span>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

            {errors.root?.splitTotal?.message ? (
              <p role="alert" className="text-sm leading-5 text-danger">
                {errors.root.splitTotal.message}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {expenseExceedsLoadedBalance && selectedAccount ? (
          <div
            role="status"
            className="rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning"
          >
            <div className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
                strokeWidth={1.9}
              />

              <p>
                This expense is greater than the currently loaded balance of{" "}
                {formatMoneyMinorUnits(
                  selectedAccount.currency,
                  selectedAccount.currentBalanceMinor,
                )}
                . The transaction is not blocked because older financial history
                may be incomplete, but the resulting negative balance should be
                reviewed.
              </p>
            </div>
          </div>
        ) : null}

        <FormField
          htmlFor="transaction-description"
          label="Description"
          description="Describe the real financial activity, such as Grocery purchase or October salary."
          descriptionId="transaction-description-description"
          error={errors.description?.message}
          errorId="transaction-description-error"
        >
          <Input
            {...register("description")}
            id="transaction-description"
            type="text"
            autoComplete="off"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={[
              "transaction-description-description",
              errors.description ? "transaction-description-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        <FormField
          htmlFor="transaction-reference"
          label="Reference"
          description="Optional receipt number, transfer reference, payslip reference, or other identifier."
          descriptionId="transaction-reference-description"
        >
          <Input
            {...register("reference")}
            id="transaction-reference"
            type="text"
            autoComplete="off"
            disabled={fieldsDisabled}
            aria-describedby="transaction-reference-description"
          />
        </FormField>

        <FormField
          htmlFor="transaction-notes"
          label="Notes"
          description="Optional context. Do not store passwords, PINs, recovery codes, or other secrets."
          descriptionId="transaction-notes-description"
          error={errors.notes?.message}
          errorId="transaction-notes-error"
        >
          <Textarea
            {...register("notes")}
            id="transaction-notes"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={[
              "transaction-notes-description",
              errors.notes ? "transaction-notes-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        {saveState === "unconfirmed" ? (
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

                <p className="mt-1">{saveError}</p>
              </div>
            </div>
          </div>
        ) : saveError ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
          >
            {saveError}
          </p>
        ) : null}

        {saveState === "saved" ? (
          <div
            role="status"
            className="flex items-center gap-2 text-sm font-medium text-success"
          >
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Transaction saved. Returning to your account balances…
          </div>
        ) : null}

        <label className="flex items-start gap-3 rounded-md border border-warning p-3 text-sm">
          <input
            type="checkbox"
            data-negative-ack="true"
            checked={acknowledgeNegativeBalance}
            disabled={fieldsDisabled}
            onChange={(event) =>
              setAcknowledgeNegativeBalance(event.target.checked)
            }
          />
          <span>
            I explicitly acknowledge that this genuine transaction may make my
            tracked account balance negative. Account history may be incomplete.
            This acknowledgement will be recorded with the command.
          </span>
        </label>
        <div className="flex flex-wrap justify-end gap-3">
          {saveState === "unconfirmed" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void retryUnconfirmedSave();
              }}
            >
              Retry same save
            </Button>
          ) : null}

          <Button
            type="submit"
            loading={saveState === "saving"}
            loadingLabel="Saving transaction…"
            disabled={
              saveState === "unconfirmed" ||
              saveState === "saved" ||
              (expenseExceedsLoadedBalance && !acknowledgeNegativeBalance)
            }
          >
            Save transaction
          </Button>
        </div>
      </form>
    </section>
  );
}
