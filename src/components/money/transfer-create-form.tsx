"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryListItem } from "@/modules/core/services/list-categories";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { isCalendarDate } from "@/shared/calendar-date";
import {
  MAX_FINANCIAL_COMPONENT_MINOR,
  parseMinorUnits,
} from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";

const decimalAmountPattern =
  /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

const transferFeeTreatments = [
  "source_additional",
  "withheld",
  "separate",
] as const;

type TransferFeeTreatment =
  (typeof transferFeeTreatments)[number];

function parseTwoDecimalAmountToMinorUnits(
  value: string,
): bigint {
  if (!decimalAmountPattern.test(value)) {
    throw new TypeError(
      "Invalid two-decimal amount.",
    );
  }

  const [wholePart = "0", fractionalPart = ""] =
    value.split(".");

  return (
    BigInt(wholePart) * 100n +
    BigInt(
      fractionalPart.padEnd(2, "0") || "0",
    )
  );
}

/*
 * isCalendarDate is a type guard that narrows string to the branded
 * CalendarDate type. Form fields intentionally remain ordinary strings until
 * submission/service boundaries, so expose a boolean-only validator to Zod.
 */
function isValidCalendarDate(
  value: string,
): boolean {
  return isCalendarDate(value);
}

function isValidOptionalUuid(
  value: string,
): boolean {
  return (
    value === "" ||
    z.uuid().safeParse(value).success
  );
}

function isValidOptionalCalendarDate(
  value: string,
): boolean {
  return (
    value === "" ||
    isValidCalendarDate(value)
  );
}

const transferFeeFormSchema = z.object({
  label: z.string(),

  amount: z.string(),

  treatment: z.enum(
    transferFeeTreatments,
  ),

  effectiveDate: z.string(),

  bearingAccountId: z.string(),

  categoryId: z.string(),
});

const transferFormSchema = z
  .object({
    sourceAccountId: z
      .string()
      .refine(
        (value) =>
          z.uuid().safeParse(value).success,
        {
          message:
            "Select a source account.",
        },
      ),

    destinationAccountId: z
      .string()
      .refine(
        (value) =>
          z.uuid().safeParse(value).success,
        {
          message:
            "Select a destination account.",
        },
      ),

    effectiveDate: z
      .string()
      .refine(isValidCalendarDate, {
        message:
          "Enter a valid transfer date.",
      }),

    destinationAmount: z
      .string()
      .trim()
      .regex(decimalAmountPattern, {
        message:
          "Enter a positive amount with no more than two decimal places.",
      })
      .refine(
        (value) => {
          if (
            !decimalAmountPattern.test(
              value,
            )
          ) {
            return true;
          }

          const amount =
            parseTwoDecimalAmountToMinorUnits(
              value,
            );

          return (
            amount > 0n &&
            amount <=
              MAX_FINANCIAL_COMPONENT_MINOR
          );
        },
        {
          message:
            "Amount must be greater than zero and within the supported financial limit.",
        },
      ),

    fees: z
      .array(transferFeeFormSchema)
      .max(
        20,
        "A transfer can contain at most 20 fee components.",
      ),

    description: z
      .string()
      .trim()
      .min(
        1,
        "Enter a transfer description.",
      )
      .max(
        2000,
        "Description must be 2,000 characters or fewer.",
      ),

    reference: z.string(),

    notes: z
      .string()
      .max(
        20_000,
        "Notes must be 20,000 characters or fewer.",
      ),
  })
  .superRefine((values, context) => {
    if (
      values.sourceAccountId ===
      values.destinationAccountId
    ) {
      context.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message:
          "Source and destination accounts must be different.",
      });
    }

    values.fees.forEach(
      (fee, index) => {
        const label =
          fee.label.trim();

        if (
          label.length === 0 ||
          label.length > 200
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fees",
              index,
              "label",
            ],
            message:
              "Fee label must contain between 1 and 200 characters.",
          });
        }

        const amount =
          fee.amount.trim();

        if (
          !decimalAmountPattern.test(
            amount,
          )
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fees",
              index,
              "amount",
            ],
            message:
              "Enter a positive fee amount with no more than two decimal places.",
          });
        } else {
          const amountMinor =
            parseTwoDecimalAmountToMinorUnits(
              amount,
            );

          if (
            amountMinor <= 0n ||
            amountMinor >
              MAX_FINANCIAL_COMPONENT_MINOR
          ) {
            context.addIssue({
              code: "custom",
              path: [
                "fees",
                index,
                "amount",
              ],
              message:
                "Fee amount must be greater than zero and within the supported financial limit.",
            });
          }
        }

        if (
          !isValidOptionalCalendarDate(
            fee.effectiveDate,
          )
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fees",
              index,
              "effectiveDate",
            ],
            message:
              "Enter a valid fee date.",
          });
        }

        if (
          !isValidOptionalUuid(
            fee.categoryId,
          )
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fees",
              index,
              "categoryId",
            ],
            message:
              "Select a valid fee category.",
          });
        }

        if (
          fee.treatment ===
            "separate" &&
          !z
            .uuid()
            .safeParse(
              fee.bearingAccountId,
            ).success
        ) {
          context.addIssue({
            code: "custom",
            path: [
              "fees",
              index,
              "bearingAccountId",
            ],
            message:
              "Select the account that paid this fee.",
          });
        }
      },
    );
  });

type TransferFormValues = z.infer<
  typeof transferFormSchema
>;

type TransferFeePayload = {
  label: string;

  amountMinor: string;

  effectiveDate: string;

  bearingAccountId: string;

  treatment: TransferFeeTreatment;

  categoryId: string | null;
};

type TransferPayload = {
  actionKind: "transfer";

  sourceAccountId: string;
  destinationAccountId: string;

  effectiveDate: string;

  destinationPrincipalMinor: string;

  fees: TransferFeePayload[];

  description: string;

  reference: string | null;

  notes: string | null;
};

type PendingTransferCommand = {
  clientCommandId: string;

  payload: TransferPayload;
};

type SaveState =
  | "idle"
  | "saving"
  | "unconfirmed"
  | "saved";

const feeTreatmentContent: Record<
  TransferFeeTreatment,
  {
    label: string;
    description: string;
  }
> = {
  source_additional: {
    label: "Source pays fee on top",
    description:
      "The destination receives the transfer amount, while the source account pays this fee in addition to that amount.",
  },

  withheld: {
    label:
      "Fee included in source-side transfer",
    description:
      "The fee is part of the gross amount removed from the source. Enter above the amount that actually reaches the destination.",
  },

  separate: {
    label:
      "Fee paid separately",
    description:
      "The fee is paid from a selected account and may occur on a different date.",
  },
};

function addAccountEffect(
  effects: Map<string, bigint>,
  accountId: string,
  amountMinor: bigint,
): void {
  effects.set(
    accountId,
    (effects.get(accountId) ?? 0n) +
      amountMinor,
  );
}

async function postTransfer(
  command: PendingTransferCommand,
): Promise<Response> {
  return fetch(
    "/api/v1/financial-actions",
    {
      method: "POST",

      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        clientCommandId:
          command.clientCommandId,

        ...command.payload,
      }),

      cache: "no-store",
    },
  );
}

export interface TransferCreateFormProps {
  currency: string;

  accounts: readonly FinancialAccountListItem[];

  categories: readonly CategoryListItem[];
}

export function TransferCreateForm({
  currency,
  accounts,
  categories,
}: TransferCreateFormProps) {
  const router = useRouter();

  const [
    pendingCommand,
    setPendingCommand,
  ] =
    useState<PendingTransferCommand | null>(
      null,
    );

  const [saveState, setSaveState] =
    useState<SaveState>("idle");

  const [saveError, setSaveError] =
    useState<string | null>(null);

  const defaultFeeCategoryId =
    categories.find(
      (category) =>
        category.kind === "expense" &&
        category.code ===
          "transaction_fees",
    )?.categoryId ?? "";

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(
      transferFormSchema,
    ),

    defaultValues: {
      sourceAccountId:
        accounts[0]?.accountId ?? "",

      destinationAccountId:
        accounts[1]?.accountId ?? "",

      effectiveDate: "",

      destinationAmount: "",

      fees: [],

      description: "",

      reference: "",

      notes: "",
    },
  });

  const {
    fields: feeFields,
    append: appendFee,
    remove: removeFee,
  } = useFieldArray({
    control,
    name: "fees",
  });

  const sourceAccountId = useWatch({
    control,
    name: "sourceAccountId",
  });

  const destinationAccountId =
    useWatch({
      control,
      name: "destinationAccountId",
    });

  const effectiveDate = useWatch({
    control,
    name: "effectiveDate",
  });

  const destinationAmount = useWatch({
    control,
    name: "destinationAmount",
  });

  const watchedFees = useWatch({
    control,
    name: "fees",
    defaultValue: [],
  });

  const sourceAccount =
    accounts.find(
      (account) =>
        account.accountId ===
        sourceAccountId,
    ) ?? null;

  const destinationAccount =
    accounts.find(
      (account) =>
        account.accountId ===
        destinationAccountId,
    ) ?? null;

  const expenseCategories =
    categories.filter(
      (category) =>
        category.kind === "expense",
    );

  const destinationPrincipalMinor =
    decimalAmountPattern.test(
      destinationAmount,
    )
      ? parseTwoDecimalAmountToMinorUnits(
          destinationAmount,
        )
      : null;

  const previewEffects =
    new Map<string, bigint>();

  const previewFees =
    watchedFees.flatMap(
      (
        fee,
        index,
      ): Array<{
        index: number;
        label: string;
        amountMinor: bigint;
        treatment: TransferFeeTreatment;
        effectiveDate: string;
        bearingAccountId: string;
      }> => {
        const amount =
          fee.amount.trim();

        if (
          !decimalAmountPattern.test(
            amount,
          )
        ) {
          return [];
        }

        const amountMinor =
          parseTwoDecimalAmountToMinorUnits(
            amount,
          );

        if (amountMinor <= 0n) {
          return [];
        }

        const bearingAccountId =
          fee.treatment === "separate"
            ? fee.bearingAccountId
            : sourceAccountId;

        const feeEffectiveDate =
          fee.treatment === "withheld"
            ? effectiveDate
            : fee.effectiveDate ||
              effectiveDate;

        return [
          {
            index,
            label:
              fee.label.trim() ||
              `Fee ${index + 1}`,
            amountMinor,
            treatment:
              fee.treatment,
            effectiveDate:
              feeEffectiveDate,
            bearingAccountId,
          },
        ];
      },
    );

  const previewFeeTotalMinor =
    previewFees.reduce(
      (total, fee) =>
        total + fee.amountMinor,
      0n,
    );

  if (
    destinationPrincipalMinor !==
      null &&
    destinationPrincipalMinor > 0n &&
    sourceAccountId &&
    destinationAccountId
  ) {
    addAccountEffect(
      previewEffects,
      sourceAccountId,
      -destinationPrincipalMinor,
    );

    addAccountEffect(
      previewEffects,
      destinationAccountId,
      destinationPrincipalMinor,
    );

    for (const fee of previewFees) {
      if (fee.bearingAccountId) {
        addAccountEffect(
          previewEffects,
          fee.bearingAccountId,
          -fee.amountMinor,
        );
      }
    }
  }

  const previewAccountEffects = [
    ...previewEffects.entries(),
  ].flatMap(
    ([accountId, effectMinor]) => {
      const account = accounts.find(
        (item) =>
          item.accountId ===
          accountId,
      );

      if (!account) {
        return [];
      }

      return [
        {
          account,
          effectMinor,
        },
      ];
    },
  );

  const accountsBelowZero =
    previewAccountEffects.filter(
      ({ account, effectMinor }) =>
        parseMinorUnits(
          account.currentBalanceMinor,
        ) +
          effectMinor <
        0n,
    );

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeTransfer(
    command: PendingTransferCommand,
  ) {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response =
        await postTransfer(command);

      if (response.ok) {
        setPendingCommand(null);
        setSaveState("saved");

        router.push(
          "/money/accounts",
        );

        return;
      }

      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether this transfer was saved. Keep this page open and retry the same save before recording another financial action.",
        );

        return;
      }

      setPendingCommand(null);
      setSaveState("idle");

      setSaveError(
        "The transfer could not be saved. Review the information and try again.",
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this transfer was saved. Keep this page open and retry the same save before recording another financial action.",
      );
    }
  }

  async function onSubmit(
    values: TransferFormValues,
  ) {
    const source = accounts.find(
      (account) =>
        account.accountId ===
        values.sourceAccountId,
    );

    const destination =
      accounts.find(
        (account) =>
          account.accountId ===
          values.destinationAccountId,
      );

    if (!source) {
      setError("sourceAccountId", {
        type: "validate",
        message:
          "The selected source account is unavailable. Refresh the page and try again.",
      });

      return;
    }

    if (!destination) {
      setError(
        "destinationAccountId",
        {
          type: "validate",
          message:
            "The selected destination account is unavailable. Refresh the page and try again.",
        },
      );

      return;
    }

    if (
      source.accountId ===
      destination.accountId
    ) {
      setError(
        "destinationAccountId",
        {
          type: "validate",
          message:
            "Source and destination accounts must be different.",
        },
      );

      return;
    }

    if (
      values.effectiveDate <=
      source.openingCutoffDate
    ) {
      setError("effectiveDate", {
        type: "validate",
        message: `Transfer date must be after the source account opening balance date (${source.openingCutoffDate}).`,
      });

      return;
    }

    if (
      values.effectiveDate <=
      destination.openingCutoffDate
    ) {
      setError("effectiveDate", {
        type: "validate",
        message: `Transfer date must be after the destination account opening balance date (${destination.openingCutoffDate}).`,
      });

      return;
    }

    const principalMinor =
      parseTwoDecimalAmountToMinorUnits(
        values.destinationAmount,
      );

    let withheldFeeTotalMinor = 0n;

    const normalizedFees: TransferFeePayload[] =
      [];

    for (const [
      index,
      fee,
    ] of values.fees.entries()) {
      const feeMinor =
        parseTwoDecimalAmountToMinorUnits(
          fee.amount.trim(),
        );

      const feeEffectiveDate =
        fee.treatment === "withheld"
          ? values.effectiveDate
          : fee.effectiveDate ||
            values.effectiveDate;

      const bearingAccountId =
        fee.treatment === "separate"
          ? fee.bearingAccountId
          : values.sourceAccountId;

      const bearingAccount =
        accounts.find(
          (account) =>
            account.accountId ===
            bearingAccountId,
        );

      if (!bearingAccount) {
        setError(
          `fees.${index}.bearingAccountId`,
          {
            type: "validate",
            message:
              "The selected fee-paying account is unavailable.",
          },
        );

        return;
      }

      if (
        feeEffectiveDate <=
        bearingAccount.openingCutoffDate
      ) {
        setError(
          `fees.${index}.effectiveDate`,
          {
            type: "validate",
            message: `Fee date must be after the fee-paying account opening balance date (${bearingAccount.openingCutoffDate}).`,
          },
        );

        return;
      }

      if (
        fee.treatment === "withheld"
      ) {
        withheldFeeTotalMinor +=
          feeMinor;
      }

      normalizedFees.push({
        label: fee.label.trim(),

        amountMinor:
          feeMinor.toString(),

        effectiveDate:
          feeEffectiveDate,

        bearingAccountId,

        treatment:
          fee.treatment,

        categoryId:
          fee.categoryId === ""
            ? null
            : fee.categoryId,
      });
    }

    if (
      principalMinor +
        withheldFeeTotalMinor >
      MAX_FINANCIAL_COMPONENT_MINOR
    ) {
      setError(
        "root.transferLimit",
        {
          type: "validate",
          message:
            "The destination amount plus withheld fees exceeds the supported financial limit.",
        },
      );

      return;
    }

    const reference =
      values.reference.trim();

    const notes =
      values.notes.trim();

    const payload: TransferPayload = {
      actionKind: "transfer",

      sourceAccountId:
        values.sourceAccountId,

      destinationAccountId:
        values.destinationAccountId,

      effectiveDate:
        values.effectiveDate,

      destinationPrincipalMinor:
        principalMinor.toString(),

      fees: normalizedFees,

      description:
        values.description.trim(),

      reference:
        reference.length > 0
          ? reference
          : null,

      notes:
        notes.length > 0
          ? notes
          : null,
    };

    const command: PendingTransferCommand =
      {
        clientCommandId:
          crypto.randomUUID(),

        payload,
      };

    setPendingCommand(command);

    await executeTransfer(command);
  }

  async function retryUnconfirmedSave() {
    if (!pendingCommand) {
      setSaveState("idle");

      setSaveError(
        "The previous transfer can no longer be retried safely. Reload the page before continuing.",
      );

      return;
    }

    await executeTransfer(
      pendingCommand,
    );
  }

  return (
    <section
      aria-labelledby="record-transfer-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div>
        <p className="text-xs font-medium text-link">
          Money
        </p>

        <h2
          id="record-transfer-title"
          className="mt-1 text-lg font-semibold text-foreground"
        >
          Transfer between accounts
        </h2>

        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
          Record a transfer that has
          already completed. The
          principal moves between your
          accounts without becoming
          income or spending. Any real
          transfer fees are recorded
          separately as expenses.
        </p>
      </div>

      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={handleSubmit(
          onSubmit,
        )}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="transfer-source"
            label="Source account"
            description="The account the money actually left."
            descriptionId="transfer-source-description"
            error={
              errors.sourceAccountId
                ?.message
            }
            errorId="transfer-source-error"
          >
            <select
              {...register(
                "sourceAccountId",
              )}
              id="transfer-source"
              disabled={
                fieldsDisabled
              }
              aria-invalid={Boolean(
                errors.sourceAccountId,
              )}
              aria-describedby={[
                "transfer-source-description",
                errors.sourceAccountId
                  ? "transfer-source-error"
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
              {accounts.map(
                (account) => (
                  <option
                    key={
                      account.accountId
                    }
                    value={
                      account.accountId
                    }
                  >
                    {account.name} —{" "}
                    {formatMoneyMinorUnits(
                      account.currency,
                      account.currentBalanceMinor,
                    )}
                  </option>
                ),
              )}
            </select>
          </FormField>

          <FormField
            htmlFor="transfer-destination"
            label="Destination account"
            description="The account where the transferred money actually arrived."
            descriptionId="transfer-destination-description"
            error={
              errors
                .destinationAccountId
                ?.message
            }
            errorId="transfer-destination-error"
          >
            <select
              {...register(
                "destinationAccountId",
              )}
              id="transfer-destination"
              disabled={
                fieldsDisabled
              }
              aria-invalid={Boolean(
                errors.destinationAccountId,
              )}
              aria-describedby={[
                "transfer-destination-description",
                errors
                  .destinationAccountId
                  ? "transfer-destination-error"
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
              {accounts.map(
                (account) => (
                  <option
                    key={
                      account.accountId
                    }
                    value={
                      account.accountId
                    }
                  >
                    {account.name} —{" "}
                    {formatMoneyMinorUnits(
                      account.currency,
                      account.currentBalanceMinor,
                    )}
                  </option>
                ),
              )}
            </select>
          </FormField>

          <FormField
            htmlFor="transfer-date"
            label="Transfer date"
            description={
              sourceAccount &&
              destinationAccount
                ? `Must be after both opening balance dates (${sourceAccount.openingCutoffDate} and ${destinationAccount.openingCutoffDate}).`
                : undefined
            }
            descriptionId="transfer-date-description"
            error={
              errors.effectiveDate
                ?.message
            }
            errorId="transfer-date-error"
          >
            <Input
              {...register(
                "effectiveDate",
              )}
              id="transfer-date"
              type="date"
              disabled={
                fieldsDisabled
              }
              aria-invalid={Boolean(
                errors.effectiveDate,
              )}
              aria-describedby={[
                sourceAccount &&
                destinationAccount
                  ? "transfer-date-description"
                  : null,
                errors.effectiveDate
                  ? "transfer-date-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="transfer-destination-amount"
            label={`Amount destination receives (${currency})`}
            description="Enter the amount that actually arrived in the destination account."
            descriptionId="transfer-destination-amount-description"
            error={
              errors
                .destinationAmount
                ?.message
            }
            errorId="transfer-destination-amount-error"
          >
            <Input
              {...register(
                "destinationAmount",
              )}
              id="transfer-destination-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              disabled={
                fieldsDisabled
              }
              aria-invalid={Boolean(
                errors.destinationAmount,
              )}
              aria-describedby={[
                "transfer-destination-amount-description",
                errors
                  .destinationAmount
                  ? "transfer-destination-amount-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              className="numeric-value"
            />
          </FormField>
        </div>

        <fieldset
          disabled={fieldsDisabled}
          className="space-y-4 rounded-control border border-border bg-surface-subtle p-4 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <legend className="text-sm font-semibold text-foreground">
                Transfer fees
              </legend>

              <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                Add only fees that were
                actually charged. Each
                fee remains an expense
                rather than becoming
                part of transferred
                spending.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={
                fieldsDisabled ||
                feeFields.length >= 20
              }
              onClick={() => {
                appendFee({
                  label:
                    "Transfer fee",

                  amount: "",

                  treatment:
                    "source_additional",

                  effectiveDate: "",

                  bearingAccountId:
                    sourceAccountId,

                  categoryId:
                    defaultFeeCategoryId,
                });
              }}
            >
              <Plus
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />

              Add fee
            </Button>
          </div>

          {feeFields.length === 0 ? (
            <p className="rounded-control border border-border bg-surface px-4 py-3 text-sm leading-6 text-muted-foreground">
              No fees added. A
              fee-free internal
              transfer changes where
              your money is held but
              does not change total
              tracked liquid funds.
            </p>
          ) : (
            <div className="space-y-4">
              {feeFields.map(
                (field, index) => {
                  const watchedFee =
                    watchedFees[
                      index
                    ];

                  const treatment =
                    watchedFee
                      ?.treatment ??
                    "source_additional";

                  const treatmentContent =
                    feeTreatmentContent[
                      treatment
                    ];

                  const labelError =
                    errors.fees?.[
                      index
                    ]?.label
                      ?.message;

                  const amountError =
                    errors.fees?.[
                      index
                    ]?.amount
                      ?.message;

                  const dateError =
                    errors.fees?.[
                      index
                    ]?.effectiveDate
                      ?.message;

                  const accountError =
                    errors.fees?.[
                      index
                    ]
                      ?.bearingAccountId
                      ?.message;

                  const categoryError =
                    errors.fees?.[
                      index
                    ]?.categoryId
                      ?.message;

                  return (
                    <div
                      key={field.id}
                      className="space-y-4 rounded-control border border-border bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Fee{" "}
                            {index +
                              1}
                          </h3>

                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {
                              treatmentContent.description
                            }
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Remove fee ${index + 1}`}
                          disabled={
                            fieldsDisabled
                          }
                          onClick={() => {
                            removeFee(
                              index,
                            );
                          }}
                        >
                          <Trash2
                            aria-hidden="true"
                            className="size-4"
                            strokeWidth={
                              1.9
                            }
                          />

                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        <FormField
                          htmlFor={`transfer-fee-label-${index}`}
                          label={`Fee label ${index + 1}`}
                          error={
                            labelError
                          }
                          errorId={`transfer-fee-label-error-${index}`}
                        >
                          <Input
                            {...register(
                              `fees.${index}.label`,
                            )}
                            id={`transfer-fee-label-${index}`}
                            type="text"
                            autoComplete="off"
                            disabled={
                              fieldsDisabled
                            }
                            aria-invalid={Boolean(
                              labelError,
                            )}
                            aria-describedby={
                              labelError
                                ? `transfer-fee-label-error-${index}`
                                : undefined
                            }
                          />
                        </FormField>

                        <FormField
                          htmlFor={`transfer-fee-amount-${index}`}
                          label={`Fee amount ${index + 1} (${currency})`}
                          error={
                            amountError
                          }
                          errorId={`transfer-fee-amount-error-${index}`}
                        >
                          <Input
                            {...register(
                              `fees.${index}.amount`,
                            )}
                            id={`transfer-fee-amount-${index}`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            disabled={
                              fieldsDisabled
                            }
                            aria-invalid={Boolean(
                              amountError,
                            )}
                            aria-describedby={
                              amountError
                                ? `transfer-fee-amount-error-${index}`
                                : undefined
                            }
                            className="numeric-value"
                          />
                        </FormField>

                        <FormField
                          htmlFor={`transfer-fee-treatment-${index}`}
                          label={`Fee treatment ${index + 1}`}
                          description={
                            treatmentContent.description
                          }
                          descriptionId={`transfer-fee-treatment-description-${index}`}
                        >
                          <select
                            {...register(
                              `fees.${index}.treatment`,
                            )}
                            id={`transfer-fee-treatment-${index}`}
                            disabled={
                              fieldsDisabled
                            }
                            aria-describedby={`transfer-fee-treatment-description-${index}`}
                            className={[
                              "min-h-11 w-full rounded-control border border-input",
                              "bg-surface px-3 py-2 text-base text-foreground",
                              "transition-colors duration-(--motion-duration-fast) ease-state",
                              "hover:border-ring",
                              "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                              "motion-reduce:transition-none",
                            ].join(
                              " ",
                            )}
                          >
                            {transferFeeTreatments.map(
                              (
                                option,
                              ) => (
                                <option
                                  key={
                                    option
                                  }
                                  value={
                                    option
                                  }
                                >
                                  {
                                    feeTreatmentContent[
                                      option
                                    ]
                                      .label
                                  }
                                </option>
                              ),
                            )}
                          </select>
                        </FormField>

                        {treatment ===
                        "separate" ? (
                          <FormField
                            htmlFor={`transfer-fee-account-${index}`}
                            label={`Fee-paying account ${index + 1}`}
                            description="Choose the account that actually paid this separate fee."
                            descriptionId={`transfer-fee-account-description-${index}`}
                            error={
                              accountError
                            }
                            errorId={`transfer-fee-account-error-${index}`}
                          >
                            <select
                              {...register(
                                `fees.${index}.bearingAccountId`,
                              )}
                              id={`transfer-fee-account-${index}`}
                              disabled={
                                fieldsDisabled
                              }
                              aria-invalid={Boolean(
                                accountError,
                              )}
                              aria-describedby={[
                                `transfer-fee-account-description-${index}`,
                                accountError
                                  ? `transfer-fee-account-error-${index}`
                                  : null,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " ",
                                )}
                              className={[
                                "min-h-11 w-full rounded-control border border-input",
                                "bg-surface px-3 py-2 text-base text-foreground",
                                "transition-colors duration-(--motion-duration-fast) ease-state",
                                "hover:border-ring",
                                "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                                "motion-reduce:transition-none",
                              ].join(
                                " ",
                              )}
                            >
                              {accounts.map(
                                (
                                  account,
                                ) => (
                                  <option
                                    key={
                                      account.accountId
                                    }
                                    value={
                                      account.accountId
                                    }
                                  >
                                    {
                                      account.name
                                    }{" "}
                                    —{" "}
                                    {formatMoneyMinorUnits(
                                      account.currency,
                                      account.currentBalanceMinor,
                                    )}
                                  </option>
                                ),
                              )}
                            </select>
                          </FormField>
                        ) : (
                          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
                            <p className="text-sm font-medium text-foreground">
                              Fee-paying
                              account
                            </p>

                            <p className="mt-1 text-sm leading-5 text-muted-foreground">
                              {sourceAccount?.name ??
                                "Source account"}
                            </p>
                          </div>
                        )}

                        {treatment !==
                        "withheld" ? (
                          <FormField
                            htmlFor={`transfer-fee-date-${index}`}
                            label={`Fee date ${index + 1}`}
                            description="Optional. Leave blank to use the transfer date."
                            descriptionId={`transfer-fee-date-description-${index}`}
                            error={
                              dateError
                            }
                            errorId={`transfer-fee-date-error-${index}`}
                          >
                            <Input
                              {...register(
                                `fees.${index}.effectiveDate`,
                              )}
                              id={`transfer-fee-date-${index}`}
                              type="date"
                              disabled={
                                fieldsDisabled
                              }
                              aria-invalid={Boolean(
                                dateError,
                              )}
                              aria-describedby={[
                                `transfer-fee-date-description-${index}`,
                                dateError
                                  ? `transfer-fee-date-error-${index}`
                                  : null,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " ",
                                )}
                            />
                          </FormField>
                        ) : (
                          <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
                            <p className="text-sm font-medium text-foreground">
                              Fee date
                            </p>

                            <p className="mt-1 text-sm leading-5 text-muted-foreground">
                              Same as
                              transfer
                              date:{" "}
                              {effectiveDate ||
                                "Not selected yet"}
                            </p>
                          </div>
                        )}

                        <FormField
                          htmlFor={`transfer-fee-category-${index}`}
                          label={`Fee category ${index + 1}`}
                          description="Optional. Transaction Fees is selected automatically when the default category is available."
                          descriptionId={`transfer-fee-category-description-${index}`}
                          error={
                            categoryError
                          }
                          errorId={`transfer-fee-category-error-${index}`}
                        >
                          <select
                            {...register(
                              `fees.${index}.categoryId`,
                            )}
                            id={`transfer-fee-category-${index}`}
                            disabled={
                              fieldsDisabled
                            }
                            aria-invalid={Boolean(
                              categoryError,
                            )}
                            aria-describedby={[
                              `transfer-fee-category-description-${index}`,
                              categoryError
                                ? `transfer-fee-category-error-${index}`
                                : null,
                            ]
                              .filter(
                                Boolean,
                              )
                              .join(
                                " ",
                              )}
                            className={[
                              "min-h-11 w-full rounded-control border border-input",
                              "bg-surface px-3 py-2 text-base text-foreground",
                              "transition-colors duration-(--motion-duration-fast) ease-state",
                              "hover:border-ring",
                              "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                              "motion-reduce:transition-none",
                            ].join(
                              " ",
                            )}
                          >
                            <option value="">
                              Uncategorized
                            </option>

                            {expenseCategories.map(
                              (
                                category,
                              ) => (
                                <option
                                  key={
                                    category.categoryId
                                  }
                                  value={
                                    category.categoryId
                                  }
                                >
                                  {
                                    category.name
                                  }
                                </option>
                              ),
                            )}
                          </select>
                        </FormField>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </fieldset>

        {destinationPrincipalMinor !==
          null &&
        destinationPrincipalMinor >
          0n ? (
          <section
            aria-labelledby="transfer-preview-title"
            className="rounded-control border border-border bg-surface p-4 sm:p-5"
          >
            <h3
              id="transfer-preview-title"
              className="text-sm font-semibold text-foreground"
            >
              Completed transfer
              preview
            </h3>

            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Review the exact account
              effects before saving.
              Principal moved between
              your own accounts is not
              income or spending.
            </p>

            <div className="mt-4 space-y-2">
              {previewAccountEffects.map(
                ({
                  account,
                  effectMinor,
                }) => (
                  <div
                    key={
                      account.accountId
                    }
                    className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface-subtle px-4 py-3"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {
                        account.name
                      }
                    </span>

                    <span className="numeric-value text-sm font-semibold text-foreground">
                      {effectMinor <
                      0n
                        ? "Decreases by "
                        : "Increases by "}
                      {formatMoneyMinorUnits(
                        currency,
                        (
                          effectMinor <
                          0n
                            ? -effectMinor
                            : effectMinor
                        ).toString(),
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Fee expense
                </p>

                <p className="numeric-value mt-1 text-base font-semibold text-foreground">
                  {formatMoneyMinorUnits(
                    currency,
                    previewFeeTotalMinor.toString(),
                  )}
                </p>
              </div>

              <div className="rounded-control border border-border bg-surface-subtle px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Total tracked
                  liquid-funds change
                </p>

                <p className="numeric-value mt-1 text-base font-semibold text-foreground">
                  {previewFeeTotalMinor ===
                  0n
                    ? formatMoneyMinorUnits(
                        currency,
                        "0",
                      )
                    : formatMoneyMinorUnits(
                        currency,
                        (
                          -previewFeeTotalMinor
                        ).toString(),
                      )}
                </p>
              </div>
            </div>

            {previewFees.length >
            0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Fee details
                </p>

                {previewFees.map(
                  (fee) => {
                    const bearer =
                      accounts.find(
                        (
                          account,
                        ) =>
                          account.accountId ===
                          fee.bearingAccountId,
                      );

                    return (
                      <p
                        key={
                          fee.index
                        }
                        className="text-sm leading-6 text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {
                            fee.label
                          }
                        </span>
                        {" · "}
                        {formatMoneyMinorUnits(
                          currency,
                          fee.amountMinor.toString(),
                        )}
                        {" · "}
                        {
                          feeTreatmentContent[
                            fee.treatment
                          ].label
                        }
                        {" · "}
                        {bearer?.name ??
                          "Account not selected"}
                        {" · "}
                        {fee.effectiveDate ||
                          "Date not selected"}
                      </p>
                    );
                  },
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {accountsBelowZero.length >
        0 ? (
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

              <div>
                <p className="font-medium">
                  This transfer may
                  produce a negative
                  account balance.
                </p>

                <p className="mt-1">
                  {accountsBelowZero
                    .map(
                      ({
                        account,
                      }) =>
                        account.name,
                    )
                    .join(", ")}
                  . The transfer is not
                  blocked because older
                  financial history may
                  be incomplete, but the
                  resulting balance
                  should be reviewed.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {errors.root
          ?.transferLimit
          ?.message ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
          >
            {
              errors.root
                .transferLimit
                .message
            }
          </p>
        ) : null}

        <FormField
          htmlFor="transfer-description"
          label="Description"
          description="Describe the completed movement, such as Transfer from GCash to savings."
          descriptionId="transfer-description-description"
          error={
            errors.description
              ?.message
          }
          errorId="transfer-description-error"
        >
          <Input
            {...register(
              "description",
            )}
            id="transfer-description"
            type="text"
            autoComplete="off"
            disabled={
              fieldsDisabled
            }
            aria-invalid={Boolean(
              errors.description,
            )}
            aria-describedby={[
              "transfer-description-description",
              errors.description
                ? "transfer-description-error"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        <FormField
          htmlFor="transfer-reference"
          label="Reference"
          description="Optional provider confirmation number or transfer reference."
          descriptionId="transfer-reference-description"
        >
          <Input
            {...register(
              "reference",
            )}
            id="transfer-reference"
            type="text"
            autoComplete="off"
            disabled={
              fieldsDisabled
            }
            aria-describedby="transfer-reference-description"
          />
        </FormField>

        <FormField
          htmlFor="transfer-notes"
          label="Notes"
          description="Optional context. Do not store passwords, PINs, recovery codes, or other secrets."
          descriptionId="transfer-notes-description"
          error={
            errors.notes?.message
          }
          errorId="transfer-notes-error"
        >
          <Textarea
            {...register("notes")}
            id="transfer-notes"
            disabled={
              fieldsDisabled
            }
            aria-invalid={Boolean(
              errors.notes,
            )}
            aria-describedby={[
              "transfer-notes-description",
              errors.notes
                ? "transfer-notes-error"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        {saveState ===
        "unconfirmed" ? (
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
                <p className="font-medium">
                  Save outcome
                  unconfirmed
                </p>

                <p className="mt-1">
                  {saveError}
                </p>
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

            Transfer saved.
            Returning to your
            account balances…
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {saveState ===
          "unconfirmed" ? (
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
            loading={
              saveState === "saving"
            }
            loadingLabel="Saving transfer…"
            disabled={
              saveState ===
                "unconfirmed" ||
              saveState === "saved"
            }
          >
            Save completed transfer
          </Button>
        </div>
      </form>
    </section>
  );
}