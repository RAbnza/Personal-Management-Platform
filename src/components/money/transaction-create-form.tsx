"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
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

const transactionFormSchema = z.object({
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
      message: "Enter a positive amount with no more than two decimal places.",
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

  incomeClass: z.enum(["earned", "gift", "reward", "other"]),

  counterpartyName: z.string(),

  description: z
    .string()
    .trim()
    .min(1, "Enter a transaction description.")
    .max(2000, "Description must be 2,000 characters or fewer."),

  reference: z.string(),

  notes: z.string().max(20_000, "Notes must be 20,000 characters or fewer."),
});

type TransactionFormValues = z.infer<typeof transactionFormSchema>;

type IncomePayload = {
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
  actionKind: "expense";

  fundingAccountId: string;

  effectiveDate: string;
  purchaseMinor: string;

  splits: [
    {
      amountMinor: string;
      categoryId: string | null;
      memo: null;
    },
  ];

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
  return fetch("/api/v1/financial-actions", {
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
  });
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

  const [pendingCommand, setPendingCommand] =
    useState<PendingFinancialCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),

    defaultValues: {
      actionKind: "expense",

      accountId: accounts[0]?.accountId ?? "",

      effectiveDate: "",

      amount: "",

      categoryId: "",

      incomeClass: "earned",

      counterpartyName: "",

      description: "",

      reference: "",

      notes: "",
    },
  });

  /*
   * React Compiler cannot safely memoize React Hook Form's imperative
   * watch() API. useWatch() is the supported subscription hook for values
   * that affect rendering.
   */
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

  const selectedAccount =
    accounts.find((account) => account.accountId === selectedAccountId) ?? null;

  const availableCategories = categories.filter(
    (category) => category.kind === actionKind,
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

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeFinancialCommand(command: PendingFinancialCommand) {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postFinancialAction(command);

      if (response.ok) {
        setPendingCommand(null);
        setSaveState("saved");

        /*
         * The Accounts page re-reads ledger-derived balances from the
         * server, so the user immediately sees the financial effect.
         */
        router.push("/money/accounts");

        return;
      }

      /*
       * A 5xx response cannot prove whether the financial transaction
       * committed. Preserve both the exact command ID and payload.
       */
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
      /*
       * A network failure has the same ambiguity as a lost successful
       * response. Never generate a new financial command for this retry.
       */
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this transaction was saved. Keep this page open and retry the same save before recording another transaction.",
      );
    }
  }

  async function onSubmit(values: TransactionFormValues) {
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

    /*
     * Financial activity must occur after the account's opening cutoff.
     * YYYY-MM-DD values are lexically chronological once validated.
     */
    if (values.effectiveDate <= account.openingCutoffDate) {
      setError("effectiveDate", {
        type: "validate",
        message: `Transaction date must be after this account's opening balance date (${account.openingCutoffDate}).`,
      });

      return;
    }

    const amountMinor = parseTwoDecimalAmountToMinorUnits(
      values.amount,
    ).toString();

    const categoryId = values.categoryId === "" ? null : values.categoryId;

    const counterpartyName = values.counterpartyName.trim();

    const reference = values.reference.trim();

    const notes = values.notes.trim();

    const common = {
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

            amountMinor,

            incomeClass: values.incomeClass,

            categoryId,

            senderName: counterpartyName.length > 0 ? counterpartyName : null,

            sourceLabel: null,

            ...common,
          }
        : {
            actionKind: "expense",

            fundingAccountId: values.accountId,

            purchaseMinor: amountMinor,

            splits: [
              {
                amountMinor,

                categoryId,

                memo: null,
              },
            ],

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
        onSubmit={handleSubmit(onSubmit)}
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

              {availableCategories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </select>
          </FormField>

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

        {expenseExceedsLoadedBalance && selectedAccount ? (
          <div
            role="status"
            className="rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning"
          >
            <div className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
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
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            Save transaction
          </Button>
        </div>
      </form>
    </section>
  );
}
