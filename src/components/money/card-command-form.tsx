"use client";
import styles from "./money-workspace.module.css";
import { useId, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  recordCardCommandBodySchema,
  cardAllocationBodySchema,
  reverseCardAllocationBodySchema,
} from "@/modules/finance/domain/card-command";
import type { getCardCommandSetup } from "@/modules/finance/services/read-card-command-setup";
import type { getCardStatement } from "@/modules/finance/services/read-card-statements";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  useCardEvidenceCommand as useCommand,
  CardEvidenceCommandReview as CommandReview,
} from "./card-evidence-command";
type Setup = Awaited<ReturnType<typeof getCardCommandSetup>>;
export function CardCommandForm({
  setup,
  purchaseActionId,
}: {
  setup: Setup;
  purchaseActionId?: string | undefined;
}) {
  const id = useId(),
    card = setup.card,
    command = useCommand(`/money/cards/${card.cardId}`),
    [kind, setKind] = useState<
      "card_payment" | "card_fee" | "card_interest" | "card_refund"
    >("card_payment");
  const [fields, setFields] = useState({
    amount: "",
    effectiveDate: "",
    postingDate: "",
    description: "",
    confirmationSource: "",
    providerReference: "",
    payingAccountId: "",
    categoryId: "",
    confirmed: false,
    negative: false,
  });
  const [evidenceChoice, setEvidenceChoice] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  const money = (n: string) => formatMoneyMinorUnits(card.currency, n);
  const field = (
    key:
      | "amount"
      | "effectiveDate"
      | "postingDate"
      | "description"
      | "confirmationSource"
      | "providerReference",
    label: string,
    type = "text",
    required = true,
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="block">
        {label}
      </label>
      <Input
        id={`${id}-${key}`}
        type={type}
        value={fields[key]}
        required={required}
        maxLength={type === "text" ? 2000 : undefined}
        inputMode={key === "amount" ? "decimal" : undefined}
        onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <div className="space-y-5">
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const parsed = recordCardCommandBodySchema.parse({
              clientCommandId: crypto.randomUUID(),
              cardId: card.cardId,
              actionKind: kind,
              effectiveDate: fields.effectiveDate,
              postingDate: fields.postingDate,
              amountMinor: parsePhpAmountToMinorUnits(fields.amount).toString(),
              description: fields.description,
              providerReference: fields.providerReference || null,
              providerConfirmed: fields.confirmed,
              confirmationSource: fields.confirmationSource,
              payingAccountId:
                kind === "card_payment" ? fields.payingAccountId : null,
              categoryId:
                kind !== "card_payment" &&
                !(kind === "card_refund" && purchaseActionId)
                  ? fields.categoryId || null
                  : null,
              purchaseActionId:
                kind === "card_refund" ? (purchaseActionId ?? null) : null,
              refundParts:
                kind === "card_refund" && purchaseActionId
                  ? setup.refundSources
                      .filter((s) => parts[s.postingId]?.trim())
                      .map((s) => ({
                        originalPurchasePostingId: s.postingId,
                        amountMinor: parsePhpAmountToMinorUnits(
                          parts[s.postingId]!,
                        ).toString(),
                      }))
                  : [],
              acknowledgeNegativeBalance: fields.negative,
            });
            const { cardId: _cardId, ...body } = parsed;
            void _cardId;
            const beforeLiability =
                BigInt(card.postedOutstandingMinor) -
                BigInt(card.cardCreditMinor),
              afterLiability =
                beforeLiability +
                (kind === "card_payment" || kind === "card_refund"
                  ? -BigInt(parsed.amountMinor)
                  : BigInt(parsed.amountMinor)),
              paying = setup.accounts.find(
                (a) => a.accountId === parsed.payingAccountId,
              );
            command.prepare({
              path: `/api/v1/credit-cards/${card.cardId}/commands`,
              body,
              summary: [
                `${kind.replace("card_", "")}: ${money(parsed.amountMinor)} on ${card.name}`,
                `Transaction ${parsed.effectiveDate}; provider posted ${parsed.postingDate}`,
                kind === "card_payment"
                  ? `Cash and card liability decrease; additional spending is zero. Paying account: ${setup.accounts.find((a) => a.accountId === parsed.payingAccountId)?.name ?? "Unavailable"}`
                  : kind === "card_refund"
                    ? "Card liability decreases; spending is offset. This is not income."
                    : "Spending and card liability increase once for the recorded provider charge.",
                `Evidence: ${parsed.confirmationSource}`,
                `Posted outstanding after this command: ${money((afterLiability > 0n ? afterLiability : 0n).toString())}; card credit: ${money((afterLiability < 0n ? -afterLiability : 0n).toString())}.`,
                ...(paying
                  ? [
                      `Paying account balance: ${money(paying.currentBalanceMinor)} → ${money((BigInt(paying.currentBalanceMinor) - BigInt(parsed.amountMinor)).toString())}`,
                    ]
                  : []),
                ...parsed.refundParts.map(
                  (p) =>
                    `Original purchase portion (${setup.refundSources.find((s) => s.postingId === p.originalPurchasePostingId)?.categoryName ?? "Uncategorized"}): ${money(p.amountMinor)}`,
                ),
              ],
            });
          } catch (e) {
            command.setError(
              e instanceof z.ZodError
                ? (e.issues[0]?.message ?? "Review the entered evidence.")
                : "Enter a positive exact amount with up to two decimal places.",
            );
          }
        }}
      >
        <fieldset
          disabled={!!command.pending || card.archived}
          className="space-y-4"
        >
          <legend className="sr-only">Recorded card financial evidence</legend>
          <div>
            <label htmlFor={`${id}-kind`} className="block">
              Activity kind
            </label>
            <select
              id={`${id}-kind`}
              className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="card_payment">Card payment</option>
              <option value="card_fee">Provider fee</option>
              <option value="card_interest">Provider interest</option>
              <option value="card_refund">Card purchase refund</option>
            </select>
          </div>
          {field("amount", `Amount (${card.currency})`)}
          {field("effectiveDate", "Transaction date", "date")}
          {field("postingDate", "Provider posting date", "date")}
          {field("description", "Description")}
          <div>
            <label
              htmlFor={`${id}-evidence`}
              className="block text-sm font-medium"
            >
              Where did you verify this?
            </label>
            <select
              id={`${id}-evidence`}
              className={styles.select}
              value={evidenceChoice}
              required
              onChange={(event) => {
                setEvidenceChoice(event.target.value);
                setFields({
                  ...fields,
                  confirmationSource:
                    event.target.value === "custom" ? "" : event.target.value,
                });
              }}
            >
              <option value="">Choose your source</option>
              <option>Bank or card app</option>
              <option>Card statement</option>
              <option>Payment receipt</option>
              <option value="custom">Another source</option>
            </select>
          </div>
          {evidenceChoice === "custom" &&
            field("confirmationSource", "Actual evidence source")}
          <details className={styles.options}>
            <summary>
              Add provider reference <span>Optional</span>
            </summary>
            {field("providerReference", "Provider reference", "text", false)}
          </details>
          {kind === "card_payment" ? (
            <div>
              <label htmlFor={`${id}-account`} className="block">
                Paying cash account
              </label>
              <select
                id={`${id}-account`}
                required
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
                value={fields.payingAccountId}
                onChange={(e) =>
                  setFields({ ...fields, payingAccountId: e.target.value })
                }
              >
                <option value="">Choose an owned account</option>
                {setup.accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.name} — {money(a.currentBalanceMinor)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            !(kind === "card_refund" && purchaseActionId) && (
              <div>
                <label htmlFor={`${id}-category`} className="block">
                  Spending category
                </label>
                <select
                  id={`${id}-category`}
                  className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
                  value={fields.categoryId}
                  onChange={(e) =>
                    setFields({ ...fields, categoryId: e.target.value })
                  }
                >
                  <option value="">Uncategorized</option>
                  {setup.categories.map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          )}
          {kind === "card_refund" && (
            <div className="space-y-3">
              <p>
                {purchaseActionId
                  ? "Refund the selected purchase using its preserved spending portions."
                  : "No originating purchase selected. Confirm the spending category from actual records."}
              </p>
              {purchaseActionId &&
                setup.refundSources.map((s, i) => (
                  <div key={s.postingId}>
                    <label htmlFor={`${id}-part-${i}`}>
                      Purchase portion {i + 1} refund ({card.currency}; eligible{" "}
                      {money(s.remainingMinor)})
                    </label>
                    <Input
                      id={`${id}-part-${i}`}
                      inputMode="decimal"
                      value={parts[s.postingId] ?? ""}
                      onChange={(e) =>
                        setParts({ ...parts, [s.postingId]: e.target.value })
                      }
                    />
                  </div>
                ))}
            </div>
          )}
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              required
              checked={fields.confirmed}
              onChange={(e) =>
                setFields({ ...fields, confirmed: e.target.checked })
              }
            />
            I confirm this actual posted transaction against provider or
            recorded evidence.
          </label>
          {kind === "card_payment" && (
            <label className="flex min-h-11 items-start gap-2">
              <input
                type="checkbox"
                checked={fields.negative}
                onChange={(e) =>
                  setFields({ ...fields, negative: e.target.checked })
                }
              />
              Acknowledge a negative cash balance if this payment causes one.
            </label>
          )}
          <Button type="submit" className="min-h-11 whitespace-normal">
            Review card command
          </Button>
        </fieldset>
      </form>
      <CommandReview command={command} />
      {card.archived && (
        <p>Restore the card before recording a new financial transaction.</p>
      )}
    </div>
  );
}
export function CardAllocationForm({
  setup,
  statement,
}: {
  setup: Setup;
  statement: Awaited<ReturnType<typeof getCardStatement>>;
}) {
  const id = useId(),
    card = setup.card,
    base = `/money/cards/${card.cardId}/statements/${statement.snapshot.statementId}`,
    command = useCommand(base, "allocationId"),
    [fields, setFields] = useState({
      source: "",
      amount: "",
      kind: "user",
      evidence: "",
      date: "",
      confirmed: false,
    }),
    [reason, setReason] = useState("");
  const money = (n: string) => formatMoneyMinorUnits(card.currency, n);
  return (
    <div className="space-y-5">
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const body = cardAllocationBodySchema.parse({
              clientCommandId: crypto.randomUUID(),
              statementRevisionId: statement.snapshot.revisionId,
              sourceActionRevisionId: fields.source,
              amountMinor: parsePhpAmountToMinorUnits(fields.amount).toString(),
              confirmationKind: fields.kind,
              confirmationSource: fields.evidence,
              confirmedDate: fields.date,
            });
            if (!fields.confirmed)
              throw Error("Confirm the allocation evidence.");
            command.prepare({
              path: `/api/v1/credit-cards/${card.cardId}/allocations`,
              body,
              summary: [
                `Allocate ${money(body.amountMinor)} to statement ${statement.snapshot.statementDate}`,
                `Confirmation: ${body.confirmationKind}; ${body.confirmationSource}; ${body.confirmedDate}`,
                "Cash, spending and the historical statement balance do not change.",
              ],
            });
          } catch (e) {
            command.setError(
              e instanceof z.ZodError
                ? (e.issues[0]?.message ?? "Review the allocation.")
                : "Confirm an exact supported allocation amount.",
            );
          }
        }}
      >
        <fieldset
          disabled={!!command.pending || !statement.isCurrent}
          className="space-y-4"
        >
          <legend className="font-semibold">
            Confirm a statement allocation
          </legend>
          <div>
            <label htmlFor={`${id}-source`} className="block">
              Recorded payment or refund
            </label>
            <select
              id={`${id}-source`}
              required
              className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
              value={fields.source}
              onChange={(e) => setFields({ ...fields, source: e.target.value })}
            >
              <option value="">Choose confirmed evidence</option>
              {setup.creditSources.items.map((s) => (
                <option key={s.actionRevisionId} value={s.actionRevisionId}>
                  {s.description} — {s.postingDate} — unapplied{" "}
                  {money(s.unappliedMinor)}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["amount", `Allocation amount (${card.currency})`],
              ["evidence", "Allocation evidence"],
              ["date", "Confirmation date"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="block">
                {label}
              </label>
              <Input
                id={`${id}-${key}`}
                value={fields[key]}
                type={key === "date" ? "date" : "text"}
                inputMode={key === "amount" ? "decimal" : undefined}
                required
                maxLength={2000}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </div>
          ))}
          <div>
            <label htmlFor={`${id}-kind`} className="block">
              Allocation confirmed by
            </label>
            <select
              id={`${id}-kind`}
              className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
              value={fields.kind}
              onChange={(e) => setFields({ ...fields, kind: e.target.value })}
            >
              <option value="user">User confirmed records</option>
              <option value="provider">Provider confirmed allocation</option>
            </select>
          </div>
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              required
              checked={fields.confirmed}
              onChange={(e) =>
                setFields({ ...fields, confirmed: e.target.checked })
              }
            />
            I confirm this amount applies to this exact statement; no allocation
            order is assumed.
          </label>
          <Button type="submit" className="whitespace-normal">
            Review allocation
          </Button>
        </fieldset>
      </form>
      <div>
        <label htmlFor={`${id}-reason`} className="block">
          Allocation reversal reason
        </label>
        <Input
          id={`${id}-reason`}
          maxLength={2000}
          disabled={!!command.pending}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <ul className="space-y-3">
          {statement.allocations.items.map((a) => (
            <li key={a.allocationId} className="border-b border-border py-3">
              <p>
                {money(a.amountMinor)} — statement revision {a.statementVersion}{" "}
                — {a.status} — {a.confirmationSource} — {a.confirmedDate}
              </p>
              {!a.reversesAllocationId && a.status !== "reversed" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!!command.pending}
                  className="whitespace-normal"
                  onClick={() => {
                    try {
                      const body = reverseCardAllocationBodySchema.parse({
                        clientCommandId: crypto.randomUUID(),
                        allocationId: a.allocationId,
                        reason,
                      });
                      command.prepare({
                        path: `/api/v1/credit-cards/${card.cardId}/allocations/reversals`,
                        body,
                        summary: [
                          `Reverse allocation ${money(a.amountMinor)}`,
                          `Reason: ${body.reason}`,
                          "Preserve original confirmation evidence; no financial posting is created.",
                        ],
                      });
                    } catch {
                      command.setError(
                        "Enter a reason before reversing an allocation.",
                      );
                    }
                  }}
                >
                  Review reversal
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <CommandReview command={command} />
    </div>
  );
}
