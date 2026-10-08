import { DebtSettlementHistory } from "@/components/money/debt-settlement-history";
import Link from "next/link";
import { z } from "zod";
import { DebtPaymentHistory } from "@/components/money/debt-payment-history";
import { DebtScheduleHistory } from "@/components/money/debt-schedule-history";
import { getDebtWithScheduleHistory } from "@/modules/finance/services/read-debt-schedules";

import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../_workspace";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const { user, workspace } = await debtWorkspace();

  const parsed = z.object({ debtId: z.uuid() }).safeParse(await params);

  let result;
  let scheduleHistory;
  let settlement;

  try {
    if (!parsed.success) {
      throw new DebtUnavailableError();
    }

    const loaded = await getDebtWithScheduleHistory({
      userId: user.id,
      workspaceId: workspace.id,
      debtId: parsed.data.debtId,
    });
    result = loaded.detail;
    scheduleHistory = loaded.history;
    settlement = loaded.settlement;
  } catch (error) {
    if (!(error instanceof DebtUnavailableError)) {
      throw error;
    }

    return (
      <div>
        <h1 className="text-2xl font-semibold">Debt unavailable</h1>

        <p className="mt-3">
          This debt could not be found in your private workspace.
        </p>

        <Link
          href="/money/debts"
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Back to debts
        </Link>
      </div>
    );
  }

  const { debt, installments } = result;

  const importedOpeningDebt = debt.openingCutoffDate !== null;

  const money = (value: string | null) =>
    value === null
      ? "Unknown / not supplied"
      : formatMoneyMinorUnits(debt.currency, value);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspace.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <article className="space-y-6">
      <header>
        <Link
          href="/money/debts"
          className="inline-flex min-h-11 items-center text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          Back to debts
        </Link>

        <h1 className="mt-2 wrap-break-word text-2xl font-semibold sm:text-3xl">
          {debt.name}
        </h1>

        <p className="mt-2 wrap-break-word text-muted-foreground">
          {debt.lenderName}
          {debt.productName ? ` · ${debt.productName}` : ""}
        </p>

        <p className="mt-2 text-sm">
          {debt.debtType.replaceAll("_", " ")} ·{" "}
          {debt.lifecycle.replaceAll("_", " ")}
        </p>
        {debt.lifecycle === "active" && debt.scheduleVersionId ? (
          <Link
            href={`/money/debts/${debt.debtId}/pay`}
            className="mt-4 inline-flex min-h-11 items-center rounded-button border border-primary-border bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Record payment
          </Link>
        ) : null}
        {debt.lifecycle === "active" && debt.scheduleVersionId ? (
          <Link
            href={`/money/debts/${debt.debtId}/revise-schedule`}
            className="ml-3 mt-4 inline-flex min-h-11 items-center text-link underline"
          >
            Revise schedule
          </Link>
        ) : null}
        {debt.lifecycle === "active" && debt.scheduleVersionId ? (
          <Link
            href={`/money/debts/${debt.debtId}/settle`}
            className="ml-3 mt-4 inline-flex min-h-11 items-center text-link underline"
          >
            Settle debt
          </Link>
        ) : null}
      </header>
      <DebtSettlementHistory settlement={settlement} currency={debt.currency} />
      <DebtScheduleHistory
        key={`${debt.debtId}:${result.financialRevision}`}
        debtId={debt.debtId}
        currency={debt.currency}
        timezone={workspace.timezone}
        initial={scheduleHistory}
      />

      <dl className="grid gap-5 rounded-card border border-border bg-card p-5 sm:grid-cols-2">
        {[
          ["Recognized liability", money(debt.recognizedLiabilityMinor)],
          ["Outstanding principal", money(debt.outstandingPrincipalMinor)],
          ["Remaining supplied schedule", money(debt.remainingScheduledMinor)],
          [
            "Payment clearing / advance (not spendable cash)",
            money(debt.paymentClearingMinor),
          ],
          [
            "Current unapplied contractual payments",
            money(debt.unappliedContractualMinor),
          ],
          [
            "Original principal (contract metadata)",
            money(debt.originalPrincipalMinor),
          ],
          ["Debt start date", debt.startDate],
          [
            "Opening cutoff (end of day)",
            debt.openingCutoffDate ?? "Not applicable — new borrowing",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>

            <dd className="numeric-value mt-1 wrap-break-word font-semibold">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2 rounded-card border border-border p-5">
        <h2 className="text-lg font-semibold">
          {importedOpeningDebt
            ? "Coverage and opening history"
            : "Borrowing and liability coverage"}
        </h2>

        <p className="text-sm leading-6">
          Liability breakdown: {debt.breakdownStatus}.{" "}
          {debt.breakdownStatus !== "known"
            ? `${money(debt.unclassifiedLiabilityMinor)} remains unclassified. Principal and interest are not inferred from the schedule.`
            : importedOpeningDebt
              ? "Liability components were supplied as part of the opening debt import."
              : "Liability components are known from the recorded borrowing."}
        </p>

        {importedOpeningDebt ? (
          <p className="text-sm leading-6">
            This opening baseline creates no cash movement, income, spending, or
            historical payments. Coverage begins after {debt.openingCutoffDate}.
            Scheduled amounts may include future charges that are not recognized
            liabilities.
          </p>
        ) : (
          <p className="text-sm leading-6">
            This debt began during tracked history. Actual proceeds were posted
            to the receiving financial account, borrowed principal was not
            treated as income, and any provider-confirmed borrowing fees were
            recorded separately. Scheduled amounts may include future charges
            that are not yet recognized liabilities.
          </p>
        )}

        <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">
          {debt.scheduleReason}
        </p>

        {debt.notes ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">
            {debt.notes}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="schedule-title" className="space-y-4">
        <h2 id="schedule-title" className="text-lg font-semibold">
          Manual schedule
        </h2>

        {installments.length === 0 ? (
          <p className="rounded-card border border-border p-5 text-sm">
            No provider due dates supplied. Scheduled payable is unknown; the
            recognized liability remains tracked.
          </p>
        ) : (
          <ol className="space-y-4">
            {installments.map((row) => {
              const remainingMinor = BigInt(row.remainingMinor);

              const openingSatisfiedMinor = BigInt(row.openingSatisfiedMinor);

              const contractualMinor = BigInt(row.contractualMinor);

              const fullySatisfiedAtOpening =
                openingSatisfiedMinor >= contractualMinor;

              const state =
                row.disposition === "cancelled"
                  ? "Cancelled"
                  : remainingMinor === 0n
                    ? fullySatisfiedAtOpening
                      ? "Satisfied at opening cutoff"
                      : "Satisfied"
                    : row.dueDate < today
                      ? "Overdue"
                      : row.dueDate === today
                        ? "Due today"
                        : "Upcoming";

              return (
                <li
                  key={row.installmentId}
                  className="space-y-3 rounded-card border border-border bg-card p-5"
                >
                  <h3 className="font-semibold">
                    Installment {row.sequenceNo} ·{" "}
                    <time dateTime={row.dueDate}>{row.dueDate}</time> · {state}
                  </h3>

                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {[
                      ["Contractual amount", row.contractualMinor],
                      ["Opening satisfaction", row.openingSatisfiedMinor],
                      [
                        "Current payment satisfaction",
                        row.paymentSatisfiedMinor,
                      ],
                      ["Remaining due", row.remainingMinor],
                      ["Known principal", row.knownPrincipalMinor],
                      ["Known interest", row.knownInterestMinor],
                      ["Known fees", row.knownFeeMinor],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-muted-foreground">{label}</dt>

                        <dd className="numeric-value mt-1">
                          {money(value ?? null)}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p className="text-sm text-muted-foreground">
                    {row.breakdownComplete
                      ? "Complete contractual breakdown"
                      : "Contractual breakdown incomplete or not supplied"}
                  </p>

                  {row.cancellationReason ? (
                    <p className="text-sm">
                      Cancellation: {row.cancellationReason}
                    </p>
                  ) : null}
                  {row.notes ? (
                    <p className="whitespace-pre-wrap wrap-break-word text-sm">
                      {row.notes}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <DebtPaymentHistory
        key={`${debt.debtId}:${result.financialRevision}`}
        debtId={debt.debtId}
        currency={debt.currency}
        financialRevision={result.financialRevision}
        timezone={workspace.timezone}
        initialItems={result.payments}
        initialCursor={result.nextPaymentCursor}
      />
    </article>
  );
}
