"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

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

/**
 * Keep calendar-date validation boolean-only at the form boundary.
 *
 * isCalendarDate() is a type predicate. Passing that predicate directly to
 * Zod would narrow the schema output to the branded CalendarDate type, which
 * is inappropriate for an editable HTML input that may temporarily contain
 * an empty or invalid string before validation.
 */
function isValidCalendarDate(value: string): boolean {
  return isCalendarDate(value);
}

const accountFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an account name.")
    .max(200, "Account name must be 200 characters or fewer."),

  accountType: z.enum(["cash", "e_wallet", "checking", "savings"]),

  institutionName: z
    .string()
    .max(200, "Institution name must be 200 characters or fewer."),

  openingCutoffDate: z.string().refine(isValidCalendarDate, {
    message: "Enter a valid opening balance date.",
  }),

  openingBalance: z
    .string()
    .trim()
    .regex(decimalAmountPattern, {
      message:
        "Enter a non-negative amount with no more than two decimal places.",
    })
    .refine(
      (value) => {
        if (!decimalAmountPattern.test(value)) {
          return true;
        }

        return (
          parseTwoDecimalAmountToMinorUnits(value) <=
          MAX_FINANCIAL_COMPONENT_MINOR
        );
      },
      {
        message:
          "Opening balance exceeds the supported financial amount limit.",
      },
    ),

  notes: z.string().max(20_000, "Notes must be 20,000 characters or fewer."),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

type AccountType = AccountFormValues["accountType"];

type OpenAccountPayload = {
  name: string;
  accountType: AccountType;

  institutionName: string | null;

  openingCutoffDate: string;
  openingBalanceMinor: string;

  notes: string | null;
};

type PendingFinancialCommand = {
  clientCommandId: string;
  payload: OpenAccountPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

const accountTypeOptions: readonly {
  value: AccountType;
  label: string;
}[] = [
  {
    value: "cash",
    label: "Cash",
  },
  {
    value: "e_wallet",
    label: "E-wallet",
  },
  {
    value: "checking",
    label: "Checking / bank",
  },
  {
    value: "savings",
    label: "Savings",
  },
];

async function postFinancialAccount(
  command: PendingFinancialCommand,
): Promise<Response> {
  return fetch("/api/v1/accounts", {
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

export interface AccountCreateFormProps {
  currency: string;
}

export function AccountCreateForm({ currency }: AccountCreateFormProps) {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingFinancialCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),

    defaultValues: {
      name: "",
      accountType: "cash",
      institutionName: "",
      openingCutoffDate: "",
      openingBalance: "0.00",
      notes: "",
    },
  });

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeFinancialCommand(command: PendingFinancialCommand) {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postFinancialAccount(command);

      if (response.ok) {
        setPendingCommand(null);
        setSaveState("saved");

        router.refresh();

        return;
      }

      /*
       * A 5xx response does not safely prove whether a financial
       * command committed. Preserve the exact command identity and
       * payload so a retry cannot accidentally create a duplicate.
       */
      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether this account was saved. Keep this page open and retry the same save before creating another account.",
        );

        return;
      }

      /*
       * A 4xx response is a definite rejection. The financial command
       * did not succeed, so the form can become editable again and a
       * later submission may use a new command identity.
       */
      setPendingCommand(null);
      setSaveState("idle");

      setSaveError(
        "The account could not be saved. Review the information and try again.",
      );
    } catch {
      /*
       * A network failure cannot establish whether the server committed
       * the request. Keep the existing command ID and payload for retry.
       */
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this account was saved. Keep this page open and retry the same save before creating another account.",
      );
    }
  }

  async function onSubmit(values: AccountFormValues) {
    const institutionName = values.institutionName.trim();

    const notes = values.notes.trim();

    const command: PendingFinancialCommand = {
      clientCommandId: crypto.randomUUID(),

      payload: {
        name: values.name.trim(),

        accountType: values.accountType,

        institutionName: institutionName.length > 0 ? institutionName : null,

        openingCutoffDate: values.openingCutoffDate,

        openingBalanceMinor: parseTwoDecimalAmountToMinorUnits(
          values.openingBalance,
        ).toString(),

        notes: notes.length > 0 ? notes : null,
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

  const nameErrorId = errors.name ? "financial-account-name-error" : undefined;

  const typeErrorId = errors.accountType
    ? "financial-account-type-error"
    : undefined;

  const institutionErrorId = errors.institutionName
    ? "financial-account-institution-error"
    : undefined;

  const dateErrorId = errors.openingCutoffDate
    ? "financial-account-opening-date-error"
    : undefined;

  const balanceErrorId = errors.openingBalance
    ? "financial-account-opening-balance-error"
    : undefined;

  const notesErrorId = errors.notes
    ? "financial-account-notes-error"
    : undefined;

  return (
    <section
      aria-labelledby="add-financial-account-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div>
        <p className="text-xs font-medium text-link">Money setup</p>

        <h2
          id="add-financial-account-title"
          className="mt-1 text-lg font-semibold text-foreground"
        >
          Add a financial account
        </h2>

        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
          An account is a place where your actual money is held. The opening
          balance establishes your starting point and is not recorded as income.
        </p>
      </div>

      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="financial-account-name"
            label="Account name"
            description="Use a name you will recognize later, such as Cash Wallet, GCash, or BDO Savings."
            descriptionId="financial-account-name-description"
            error={errors.name?.message}
            errorId="financial-account-name-error"
          >
            <Input
              {...register("name")}
              id="financial-account-name"
              type="text"
              autoComplete="off"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={[
                "financial-account-name-description",
                nameErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="financial-account-type"
            label="Account type"
            error={errors.accountType?.message}
            errorId="financial-account-type-error"
          >
            <select
              {...register("accountType")}
              id="financial-account-type"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.accountType)}
              aria-describedby={typeErrorId}
              className={[
                "min-h-11 w-full rounded-control border border-input",
                "bg-surface px-3 py-2 text-base text-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:border-ring",
                "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              {accountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="financial-account-institution"
            label="Institution"
            description="Optional. Examples include GCash, Maya, BDO, BPI, or another provider."
            descriptionId="financial-account-institution-description"
            error={errors.institutionName?.message}
            errorId="financial-account-institution-error"
          >
            <Input
              {...register("institutionName")}
              id="financial-account-institution"
              type="text"
              autoComplete="organization"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.institutionName)}
              aria-describedby={[
                "financial-account-institution-description",
                institutionErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="financial-account-opening-date"
            label="Opening balance date"
            description="Choose the date that the opening balance represents. This is a calendar date, not a transaction timestamp."
            descriptionId="financial-account-opening-date-description"
            error={errors.openingCutoffDate?.message}
            errorId="financial-account-opening-date-error"
          >
            <Input
              {...register("openingCutoffDate")}
              id="financial-account-opening-date"
              type="date"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.openingCutoffDate)}
              aria-describedby={[
                "financial-account-opening-date-description",
                dateErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="financial-account-opening-balance"
            label={`Opening balance (${currency})`}
            description="Enter the actual balance at the opening balance date. This establishes a baseline and does not count as income."
            descriptionId="financial-account-opening-balance-description"
            error={errors.openingBalance?.message}
            errorId="financial-account-opening-balance-error"
          >
            <Input
              {...register("openingBalance")}
              id="financial-account-opening-balance"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.openingBalance)}
              aria-describedby={[
                "financial-account-opening-balance-description",
                balanceErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
              className="numeric-value"
            />
          </FormField>
        </div>

        <FormField
          htmlFor="financial-account-notes"
          label="Notes"
          description="Optional context about the account. Do not store passwords, PINs, recovery codes, or other secrets here."
          descriptionId="financial-account-notes-description"
          error={errors.notes?.message}
          errorId="financial-account-notes-error"
        >
          <Textarea
            {...register("notes")}
            id="financial-account-notes"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={[
              "financial-account-notes-description",
              notesErrorId,
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
            Account saved. Refreshing your balances…
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
            loadingLabel="Saving account…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            Save account
          </Button>
        </div>
      </form>
    </section>
  );
}
