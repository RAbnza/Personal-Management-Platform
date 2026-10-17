"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { ReviewSummary } from "@/components/patterns/review";
import { TaskStage } from "./task-stage";
import taskStyles from "./money-workspace.module.css";
import { useClientReady } from "@/shared/use-client-ready";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import type { CreditCardReadModel } from "@/modules/finance/services/read-credit-cards";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR, parseMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { SharedExpenseEntry } from "@/components/sharing/bill-form";
import type { GroupSummary } from "@/modules/sharing/services/read-groups";
import type { PrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";

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
    postingDate: z.string(),
    providerReference: z.string().max(2000),
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

type CardPurchasePayload = Omit<
  ExpensePayload,
  "actionKind" | "fundingAccountId"
> & {
  actionKind: "card_purchase";
  cardId: string;
  postingDate: string;
  providerReference: string | null;
};
type FinancialActionPayload =
  IncomePayload | ExpensePayload | CardPurchasePayload;

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
): Promise<{ response: Response; actionId: string | null }> {
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
    let actionId: string | null = null;
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
      actionId = result.data.actionId;
    }
    return { response, actionId };
  } finally {
    clearTimeout(timeout);
  }
}

export interface TransactionCreateFormProps {
  sharing?: { groups: GroupSummary[]; setup: PrivateSharingSetup };
  currency: string;
  today?: string;
  cards?: readonly CreditCardReadModel[];
  initialKind?: "income" | "expense";

  accounts: readonly FinancialAccountListItem[];

  categories: readonly CategoryListItem[];
  planningSuggestion?: {
    occurrenceId: string;
    occurrenceVersion: number;
    kind: "income" | "bill" | "subscription";
    remainingMinor: string;
    name: string;
    accountId: string | null;
    categoryId: string | null;
  };
}

export function TransactionCreateForm({
  currency,
  today = "",
  accounts,
  categories,
  cards = [],
  planningSuggestion,
  initialKind = "expense",
  sharing,
}: TransactionCreateFormProps) {
  const router = useRouter();
  const clientReady = useClientReady();
  const [sharedMode, setSharedMode] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Omit<
    PendingFinancialCommand,
    "clientCommandId"
  > | null>(null);

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
    getValues,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),

    defaultValues: {
      actionKind: planningSuggestion
        ? planningSuggestion.kind === "income"
          ? "income"
          : "expense"
        : initialKind,

      accountId: planningSuggestion
        ? (accounts.find((a) => a.accountId === planningSuggestion.accountId)
            ?.accountId ?? "")
        : (accounts[0]?.accountId ?? cards[0]?.cardId ?? ""),

      effectiveDate: today,

      amount: planningSuggestion
        ? exactDecimal(planningSuggestion.remainingMinor)
        : "",

      categoryId:
        categories.find((c) => c.categoryId === planningSuggestion?.categoryId)
          ?.categoryId ?? "",

      expenseSplits: [
        {
          amount: planningSuggestion
            ? exactDecimal(planningSuggestion.remainingMinor)
            : "",
          categoryId:
            categories.find(
              (c) => c.categoryId === planningSuggestion?.categoryId,
            )?.categoryId ?? "",
        },
      ],

      incomeClass: "earned",

      counterpartyName: "",

      description: planningSuggestion?.name ?? "",

      reference: "",

      notes: "",
      postingDate: "",
      providerReference: "",
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
  const selectedCard =
    actionKind === "expense"
      ? cards.find((c) => c.cardId === selectedAccountId)
      : undefined;
  useEffect(() => {
    if (
      actionKind === "income" &&
      cards.some((c) => c.cardId === selectedAccountId)
    )
      setValue("accountId", accounts[0]?.accountId ?? "");
  }, [actionKind, selectedAccountId, accounts, cards, setValue]);

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
    !clientReady ||
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeFinancialCommand(command: PendingFinancialCommand) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);

    try {
      const { response, actionId } = await postFinancialAction(command);

      if (response.ok) {
        setPendingCommand(null);
        setSaveState("saved");

        router.push(
          planningSuggestion
            ? `/money/recurring/occurrences/${planningSuggestion.occurrenceId}?preferredActionId=${actionId}`
            : command.payload.actionKind === "card_purchase"
              ? "/money/actions"
              : "/money/accounts",
        );

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
    const card =
      values.actionKind === "expense"
        ? cards.find((c) => c.cardId === values.accountId)
        : undefined;

    if (!account && !card) {
      setError("accountId", {
        type: "validate",
        message:
          "The selected account is unavailable. Refresh the page and try again.",
      });

      return;
    }

    if (account && values.effectiveDate <= account.openingCutoffDate) {
      setError("effectiveDate", {
        type: "validate",
        message: `Transaction date must be after this account's opening balance date (${account.openingCutoffDate}).`,
      });

      return;
    }
    if (card && !isCalendarDate(values.postingDate)) {
      setError(
        "postingDate",
        {
          type: "validate",
          message:
            "Enter the provider-confirmed posting date. Pending authorizations cannot be recorded here.",
        },
        { shouldFocus: true },
      );
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

    let payload: FinancialActionPayload =
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
    if (card && payload.actionKind === "expense") {
      const {
        fundingAccountId: _account,
        actionKind: _kind,
        ...purchase
      } = payload;
      void _account;
      void _kind;
      payload = {
        ...purchase,
        actionKind: "card_purchase",
        cardId: card.cardId,
        postingDate: values.postingDate,
        providerReference: values.providerReference.trim() || null,
        acknowledgeNegativeBalance: false,
      };
    }

    setReviewDraft({ accountId: values.accountId, payload });
    setSaveError(null);
  }

  async function confirmReviewedTransaction() {
    if (
      !reviewDraft ||
      savingRef.current ||
      fieldsDisabled ||
      (expenseExceedsLoadedBalance && !acknowledgeNegativeBalance)
    )
      return;
    const command: PendingFinancialCommand = {
      ...reviewDraft,
      clientCommandId: crypto.randomUUID(),
      payload: {
        ...reviewDraft.payload,
        acknowledgeNegativeBalance:
          reviewDraft.payload.actionKind === "card_purchase"
            ? false
            : acknowledgeNegativeBalance,
      },
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

  if (sharedMode && sharing)
    return (
      <SharedExpenseEntry
        groups={sharing.groups}
        setup={sharing.setup}
        defaults={{
          amount: getValues("amount"),
          description: getValues("description"),
          date: getValues("effectiveDate"),
          funding: `${selectedCard ? "card" : "cash"}:${selectedAccountId}`,
          categoryId: getValues("categoryId"),
          postingDate: getValues("postingDate"),
          providerReference: getValues("providerReference"),
        }}
        onCancel={() => setSharedMode(false)}
      />
    );
  return (
    <section
      aria-labelledby="record-transaction-title"
      className={`${taskStyles.task} rounded-panel border border-border bg-surface p-4 sm:p-6`}
    >
      <div className={taskStyles.entryHeading}>
        <span className={taskStyles.entryMark}>
          <Plus size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">MAKE IT A HABIT</p>
          <h2
            id="record-transaction-title"
            className="mt-1 text-xl font-semibold"
          >
            {actionKind === "income" ? "Money in" : "Add an expense"}
          </h2>
        </div>
      </div>
      <TaskStage reviewing={reviewDraft !== null} />
      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          if (reviewDraft) event.preventDefault();
          else void handleSubmit(onSubmit)(event);
        }}
        onChangeCapture={(event) => {
          if (!(event.target as HTMLElement).hasAttribute("data-negative-ack"))
            setAcknowledgeNegativeBalance(false);
        }}
        onClickCapture={(event) => {
          if (
            !reviewDraft &&
            saveState === "idle" &&
            (event.target as Element).closest('button[type="button"]')
          )
            setAcknowledgeNegativeBalance(false);
        }}
      >
        <div hidden={reviewDraft !== null} className={taskStyles.entryFields}>
          <fieldset
            disabled={fieldsDisabled}
            className={taskStyles.intentSwitch}
          >
            <legend className="sr-only">Transaction type</legend>
            <label>
              <input {...register("actionKind")} type="radio" value="expense" />
              Expense
            </label>
            <label>
              <input {...register("actionKind")} type="radio" value="income" />
              Income
            </label>
          </fieldset>
          <div className={taskStyles.amountEntry}>
            <FormField
              htmlFor="transaction-amount"
              label={`Amount (${currency})`}
              error={errors.amount?.message}
              errorId="transaction-amount-error"
            >
              <Input
                {...register("amount")}
                id="transaction-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                disabled={fieldsDisabled}
              />
            </FormField>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              htmlFor="transaction-account"
              label={
                actionKind === "income"
                  ? "Receiving account"
                  : cards.length
                    ? "Paid with"
                    : "Funding account"
              }
              error={errors.accountId?.message}
            >
              <select
                {...register("accountId")}
                id="transaction-account"
                disabled={fieldsDisabled}
                className={taskStyles.select}
              >
                {accounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.name} ·{" "}
                    {formatMoneyMinorUnits(
                      account.currency,
                      account.currentBalanceMinor,
                    )}
                  </option>
                ))}
                {actionKind === "expense" &&
                  cards.map((card) => (
                    <option key={card.cardId} value={card.cardId}>
                      {card.name} · Credit card
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField
              htmlFor="transaction-date"
              label="Transaction date"
              error={errors.effectiveDate?.message}
            >
              <Input
                {...register("effectiveDate")}
                id="transaction-date"
                type="date"
                disabled={fieldsDisabled}
              />
            </FormField>
          </div>
          <FormField
            htmlFor="transaction-description"
            label="Description"
            error={errors.description?.message}
          >
            <Input
              {...register("description")}
              id="transaction-description"
              placeholder={
                actionKind === "income" ? "What came in?" : "What was it for?"
              }
              autoComplete="off"
              disabled={fieldsDisabled}
            />
          </FormField>
          {actionKind === "income" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                htmlFor="transaction-income-class"
                label="Income type"
                error={errors.incomeClass?.message}
              >
                <select
                  {...register("incomeClass")}
                  id="transaction-income-class"
                  disabled={fieldsDisabled}
                  className={taskStyles.select}
                >
                  {incomeClassOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                htmlFor="transaction-category"
                label="Category"
                error={errors.categoryId?.message}
              >
                <select
                  {...register("categoryId")}
                  id="transaction-category"
                  disabled={fieldsDisabled}
                  className={taskStyles.select}
                >
                  <option value="">Uncategorized</option>
                  {incomeCategories.map((category) => (
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
          ) : (
            <fieldset disabled={fieldsDisabled} className="space-y-3">
              <legend className="sr-only">Expense categories</legend>
              {expenseSplitFields.map((field, index) => (
                <div
                  key={field.id}
                  className={
                    expenseSplitFields.length > 1
                      ? taskStyles.splitRow
                      : undefined
                  }
                >
                  <FormField
                    htmlFor={`expense-split-category-${index}`}
                    label={
                      expenseSplitFields.length > 1
                        ? `Category ${index + 1}`
                        : "Category"
                    }
                    error={errors.expenseSplits?.[index]?.categoryId?.message}
                  >
                    <select
                      {...register(`expenseSplits.${index}.categoryId`)}
                      id={`expense-split-category-${index}`}
                      className={taskStyles.select}
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
                  {expenseSplitFields.length > 1 ? (
                    <>
                      <FormField
                        htmlFor={`expense-split-amount-${index}`}
                        label={`Portion ${index + 1} amount (${currency})`}
                        error={errors.expenseSplits?.[index]?.amount?.message}
                      >
                        <Input
                          {...register(`expenseSplits.${index}.amount`)}
                          id={`expense-split-amount-${index}`}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </FormField>
                      <Button
                        variant="ghost"
                        aria-label={`Remove category portion ${index + 1}`}
                        onClick={() => removeExpenseSplit(index)}
                      >
                        <Trash2 size={16} />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <input
                      type="hidden"
                      disabled={fieldsDisabled}
                      {...register(`expenseSplits.${index}.amount`)}
                    />
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                disabled={fieldsDisabled}
                onClick={() =>
                  appendExpenseSplit({ amount: "", categoryId: "" })
                }
              >
                <Plus size={16} />
                Add category split
              </Button>
              {expenseSplitFields.length > 1 &&
                purchaseAmountMinor !== null && (
                  <div role="status" className="text-sm">
                    <p>
                      Allocated{" "}
                      {formatMoneyMinorUnits(
                        currency,
                        allocatedExpenseMinor.toString(),
                      )}{" "}
                      of{" "}
                      {formatMoneyMinorUnits(
                        currency,
                        purchaseAmountMinor.toString(),
                      )}
                      .
                    </p>
                    <p
                      className={
                        remainingExpenseMinor === 0n
                          ? "text-success"
                          : "text-warning"
                      }
                    >
                      {remainingExpenseMinor === 0n
                        ? "Category portions match the purchase amount exactly."
                        : `Remaining: ${formatMoneyMinorUnits(currency, (remainingExpenseMinor ?? 0n).toString())}`}
                    </p>
                  </div>
                )}
              {errors.root?.splitTotal?.message && (
                <p role="alert" className="text-sm text-danger">
                  {errors.root.splitTotal.message}
                </p>
              )}
            </fieldset>
          )}
          {selectedCard && (
            <section
              className={taskStyles.contextBox}
              aria-label="Card purchase details"
            >
              <p className="text-sm">
                Only record purchases already posted by{" "}
                {selectedCard.issuerName}. Pending authorizations are not
                supported.
              </p>
              <FormField
                htmlFor="card-posting-date"
                label="Provider posting date"
                error={errors.postingDate?.message}
              >
                <Input
                  {...register("postingDate")}
                  id="card-posting-date"
                  type="date"
                  disabled={fieldsDisabled}
                />
              </FormField>
            </section>
          )}
          <details
            className={taskStyles.options}
            open={errors.notes || errors.providerReference ? true : undefined}
          >
            <summary>
              More details{" "}
              <span>
                Notes, receipt,{" "}
                {actionKind === "income" ? "sender" : "merchant"}
              </span>
            </summary>
            <div className="grid gap-5 pt-4">
              <FormField
                htmlFor="transaction-counterparty"
                label={actionKind === "income" ? "Sender / source" : "Merchant"}
              >
                <Input
                  {...register("counterpartyName")}
                  id="transaction-counterparty"
                  disabled={fieldsDisabled}
                />
              </FormField>
              <FormField htmlFor="transaction-reference" label="Reference">
                <Input
                  {...register("reference")}
                  id="transaction-reference"
                  disabled={fieldsDisabled}
                />
              </FormField>
              {selectedCard && (
                <FormField
                  htmlFor="card-provider-reference"
                  label="Provider reference"
                  error={errors.providerReference?.message}
                >
                  <Input
                    {...register("providerReference")}
                    id="card-provider-reference"
                    disabled={fieldsDisabled}
                  />
                </FormField>
              )}
              <FormField
                htmlFor="transaction-notes"
                label="Notes"
                error={errors.notes?.message}
              >
                <Textarea
                  {...register("notes")}
                  id="transaction-notes"
                  disabled={fieldsDisabled}
                />
              </FormField>
              {sharing && actionKind === "expense" && !planningSuggestion && (
                <Button
                  variant="secondary"
                  disabled={fieldsDisabled}
                  onClick={() => setSharedMode(true)}
                >
                  Split with people
                </Button>
              )}
            </div>
          </details>
          {expenseExceedsLoadedBalance && selectedAccount && (
            <p
              role="status"
              className="rounded-control border border-warning bg-warning-surface p-3 text-sm text-warning"
            >
              This expense exceeds the loaded balance of{" "}
              {formatMoneyMinorUnits(
                currency,
                selectedAccount.currentBalanceMinor,
              )}
              . You can record it after acknowledging the negative balance in
              review.
            </p>
          )}
        </div>
        {reviewDraft && (
          <ReviewSummary
            detailKeys={[
              "cash",
              "spending",
              "liability",
              ...(reviewDraft.payload.reference ? [] : ["reference"]),
              ...(reviewDraft.payload.notes ? [] : ["notes"]),
            ]}
            title={
              reviewDraft.payload.actionKind === "income"
                ? "Review income"
                : "Review expense"
            }
            rows={[
              {
                key: "description",
                label: "Description",
                value: reviewDraft.payload.description,
              },
              {
                key: "date",
                label: "Effective date",
                value: reviewDraft.payload.effectiveDate,
              },
              {
                key: "funding",
                label:
                  reviewDraft.payload.actionKind === "income"
                    ? "Receiving account"
                    : "Paid with",
                value:
                  selectedCard?.name ?? selectedAccount?.name ?? "Unavailable",
              },
              {
                key: "amount",
                label:
                  reviewDraft.payload.actionKind === "income"
                    ? "Received"
                    : "Purchase",
                value: formatMoneyMinorUnits(
                  currency,
                  "purchaseMinor" in reviewDraft.payload
                    ? reviewDraft.payload.purchaseMinor
                    : reviewDraft.payload.amountMinor,
                ),
              },
              {
                key: "cash",
                label: "Cash change",
                value: formatMoneyMinorUnits(
                  currency,
                  reviewDraft.payload.actionKind === "card_purchase"
                    ? "0"
                    : reviewDraft.payload.actionKind === "income"
                      ? reviewDraft.payload.amountMinor
                      : (-BigInt(reviewDraft.payload.purchaseMinor)).toString(),
                ),
              },
              ...(selectedAccount
                ? [
                    {
                      key: "balance",
                      label: "Loaded account balance after",
                      value: formatMoneyMinorUnits(
                        currency,
                        (
                          BigInt(selectedAccount.currentBalanceMinor) +
                          (reviewDraft.payload.actionKind === "income"
                            ? BigInt(reviewDraft.payload.amountMinor)
                            : reviewDraft.payload.actionKind === "expense"
                              ? -BigInt(reviewDraft.payload.purchaseMinor)
                              : 0n)
                        ).toString(),
                      ),
                    },
                  ]
                : []),
              {
                key: "spending",
                label: "Recognized spending",
                value: formatMoneyMinorUnits(
                  currency,
                  "purchaseMinor" in reviewDraft.payload
                    ? reviewDraft.payload.purchaseMinor
                    : "0",
                ),
              },
              {
                key: "liability",
                label: "Card liability increase",
                value: formatMoneyMinorUnits(
                  currency,
                  reviewDraft.payload.actionKind === "card_purchase"
                    ? reviewDraft.payload.purchaseMinor
                    : "0",
                ),
              },
              ...(reviewDraft.payload.actionKind === "card_purchase"
                ? [
                    {
                      key: "posted",
                      label: "Provider posted",
                      value: reviewDraft.payload.postingDate,
                    },
                    {
                      key: "provider",
                      label: "Provider reference",
                      value: reviewDraft.payload.providerReference ?? "None",
                    },
                  ]
                : []),
              {
                key: "reference",
                label: "Reference",
                value: reviewDraft.payload.reference ?? "None",
              },
              {
                key: "notes",
                label: "Notes",
                value: (
                  <span className="whitespace-pre-wrap">
                    {reviewDraft.payload.notes ?? "None"}
                  </span>
                ),
              },
            ]}
          >
            {expenseExceedsLoadedBalance && (
              <p
                role="status"
                className="mb-3 rounded-control border border-warning bg-warning-surface p-3 text-sm"
              >
                This expense exceeds the loaded account balance. Older records
                may be incomplete. Review the resulting negative balance and
                explicitly acknowledge it before confirming.
              </p>
            )}
            {"splits" in reviewDraft.payload ? (
              <ul className="divide-y divide-border">
                {reviewDraft.payload.splits.map((split, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap justify-between gap-3 py-2 text-sm"
                  >
                    <span>
                      {categories.find((c) => c.categoryId === split.categoryId)
                        ?.name ?? "Uncategorized"}
                    </span>
                    <span className="numeric-value">
                      {formatMoneyMinorUnits(currency, split.amountMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                Classification: {reviewDraft.payload.incomeClass} · Category:{" "}
                {categories.find(
                  (c) =>
                    c.categoryId ===
                    ("categoryId" in reviewDraft.payload
                      ? reviewDraft.payload.categoryId
                      : null),
                )?.name ?? "Uncategorized"}
              </p>
            )}
            <p className="mt-3 text-sm">
              {reviewDraft.payload.actionKind === "income"
                ? `Sender: ${reviewDraft.payload.senderName ?? "None"}`
                : `Merchant: ${reviewDraft.payload.merchantName ?? "None"}`}
            </p>
            {planningSuggestion && (
              <p className="mt-3 text-sm">
                Recurring context: {planningSuggestion.name}. The existing
                occurrence confirmation remains a separate explicit step after
                the actual transaction.
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Review is based on the loaded records. Saving revalidates the
              transaction on the server. Read the save outcome below before
              starting another transaction.
            </p>
          </ReviewSummary>
        )}
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
            Transaction saved. Opening your financial history…
          </div>
        ) : null}

        {reviewDraft && !selectedCard && expenseExceedsLoadedBalance && (
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
              tracked account balance negative. Account history may be
              incomplete. This acknowledgement will be recorded with the
              command.
            </span>
          </label>
        )}
        <div className={taskStyles.taskActions}>
          {reviewDraft && saveState === "idle" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReviewDraft(null);
                setAcknowledgeNegativeBalance(false);
                setSaveError(null);
              }}
            >
              Edit details
            </Button>
          )}
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
            type={reviewDraft ? "button" : "submit"}
            onClick={
              reviewDraft ? () => void confirmReviewedTransaction() : undefined
            }
            loading={saveState === "saving"}
            loadingLabel="Saving transaction…"
            disabled={
              !clientReady ||
              saveState === "unconfirmed" ||
              saveState === "saved" ||
              (reviewDraft !== null &&
                expenseExceedsLoadedBalance &&
                !acknowledgeNegativeBalance)
            }
          >
            {reviewDraft
              ? "Confirm and save transaction"
              : "Continue to review"}
          </Button>
        </div>
      </form>
    </section>
  );
}
