"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cardInstallmentCommandSchema,
  cardInstallmentApplicationSchema,
  reverseInstallmentApplicationSchema,
  installmentMinor,
  installmentProjection,
} from "@/modules/finance/domain/card-installment";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  useCardEvidenceCommand,
  CardEvidenceCommandReview,
} from "./card-evidence-command";
import type {
  getCardInstallmentSetup,
  getCardInstallmentPlan,
} from "@/modules/finance/services/read-card-installments";
type Setup = Awaited<ReturnType<typeof getCardInstallmentSetup>>;
type Detail = Awaited<ReturnType<typeof getCardInstallmentPlan>>;
type Row = {
  dueDate: string;
  principal: string;
  interest: string;
  fee: string;
  total: string;
  reference: string;
  notes: string;
};
const emptyRow = (): Row => ({
  dueDate: "",
  principal: "",
  interest: "",
  fee: "",
  total: "",
  reference: "",
  notes: "",
});
const editable = (minor: string | null) => {
  if (minor === null) return "";
  const n = BigInt(minor);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
};
export function parseInstallmentAmount(value: string) {
  const m = /^(0|[1-9]\d{0,16})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m)
    throw new RangeError(
      "Enter exact amounts with at most two decimal places.",
    );
  return installmentMinor.parse(
    (BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"))).toString(),
  );
}
export function CardInstallmentPlanForm({
  setup,
  purchase,
  today,
  detail,
}: {
  setup: Setup;
  purchase: Setup["purchases"][number];
  today: string;
  detail?: Detail;
}) {
  const id = useId(),
    base = `/money/cards/${setup.card.cardId}/installments`,
    command = useCardEvidenceCommand(
      detail ? `${base}/${detail.planId}` : base,
      "planId",
    ),
    prior = detail?.snapshot;
  const [fields, setFields] = useState({
    principal: editable(prior?.principalMinor ?? null),
    count: String(prior?.installmentCount ?? 1),
    lifecycle:
      detail && !detail.currentPurchase ? "" : (prior?.lifecycle ?? "active"),
    reference: prior?.providerReference ?? "",
    source: prior?.verificationSource ?? "",
    date: today,
    notes: prior?.notes ?? "",
    reason: "",
    confirmed: false,
  });
  const [rows, setRows] = useState<Row[]>(
    prior
      ? prior.installments.map((i) => ({
          dueDate: i.dueDate ?? "",
          principal: editable(i.principalMinor),
          interest: editable(i.interestMinor),
          fee: editable(i.feeMinor),
          total: editable(i.totalMinor),
          reference: i.providerReference ?? "",
          notes: i.notes ?? "",
        }))
      : [emptyRow()],
  );
  const money = (v: string | null) =>
      v === null ? "Unknown" : formatMoneyMinorUnits(setup.card.currency, v),
    locked = !!command.pending;
  return (
    <div className="space-y-5 break-words">
      <p>
        Use the complete provider schedule, including portions already settled.
        Confirmed payment applications determine remaining amounts. Blank future
        dates, interest, fees and totals stay unknown.
      </p>
      <p>
        Recognized purchase {purchase.description}:{" "}
        {money(purchase.amountMinor)}. Recording this schedule does not change
        spending, card liability or cash.
      </p>
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (!fields.confirmed)
              throw Error("Confirm the complete provider evidence.");
            const snapshot = cardInstallmentCommandSchema.parse({
              clientCommandId: crypto.randomUUID(),
              cardId: setup.card.cardId,
              purchaseActionId: purchase.actionId,
              purchaseActionRevisionId:
                fields.lifecycle === "cancelled" && prior
                  ? prior.purchaseActionRevisionId
                  : purchase.actionRevisionId,
              principalMinor: parseInstallmentAmount(fields.principal),
              installmentCount: Number(fields.count),
              lifecycle: fields.lifecycle,
              providerReference: fields.reference.trim() || null,
              verificationSource: fields.source,
              verifiedDate: fields.date,
              providerConfirmed: true,
              notes: fields.notes || null,
              ...(detail
                ? {
                    planId: detail.planId,
                    expectedVersion: detail.currentVersion,
                    reason: fields.reason,
                  }
                : {}),
              installments: rows.map((r) => ({
                dueDate: r.dueDate || null,
                principalMinor: parseInstallmentAmount(r.principal),
                interestMinor: r.interest.trim()
                  ? parseInstallmentAmount(r.interest)
                  : null,
                feeMinor: r.fee.trim() ? parseInstallmentAmount(r.fee) : null,
                totalMinor: r.total.trim()
                  ? parseInstallmentAmount(r.total)
                  : null,
                providerReference: r.reference.trim() || null,
                notes: r.notes || null,
              })),
            });
            const { cardId: _card, planId: _plan, ...body } = snapshot;
            void _card;
            void _plan;
            command.prepare({
              path: detail
                ? `/api/v1/credit-cards/${setup.card.cardId}/installments/${detail.planId}/revisions`
                : `/api/v1/credit-cards/${setup.card.cardId}/installments`,
              body,
              summary: [
                `${snapshot.lifecycle === "cancelled" ? "Cancel" : "Confirm"} provider schedule for ${purchase.description}`,
                `Financed principal ${money(snapshot.principalMinor)}; ${snapshot.installmentCount} installments`,
                `Verified ${snapshot.verifiedDate}: ${snapshot.verificationSource}`,
                ...(snapshot.reason ? [`Reason: ${snapshot.reason}`] : []),
                ...snapshot.installments.map(
                  (r, n) =>
                    `Installment ${n + 1}: due ${r.dueDate ?? "Unknown"}; principal ${money(r.principalMinor)}; interest ${money(r.interestMinor)}; fee ${money(r.feeMinor)}; total ${money(installmentProjection(r).remainingTotalMinor)}`,
                ),
                "Scheduling evidence only: no additional purchase expense, liability or cash movement.",
              ],
            });
          } catch {
            command.setError(
              "Review the complete provider count, exact amounts, date order, evidence and required correction reason.",
            );
          }
        }}
      >
        <fieldset disabled={locked} className="space-y-4">
          <legend className="font-semibold">
            Provider installment arrangement
          </legend>
          {(
            [
              ["principal", `Financed principal (${setup.card.currency})`],
              ["count", "Provider installment count"],
              ["reference", "Provider plan reference"],
              ["source", "Provider verification source"],
              ["date", "Provider verification date"],
              ["notes", "Plan notes"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="block">
                {label}
              </label>
              <Input
                id={`${id}-${key}`}
                value={fields[key]}
                required={["principal", "count", "source", "date"].includes(
                  key,
                )}
                type={
                  key === "date" ? "date" : key === "count" ? "number" : "text"
                }
                min={key === "count" ? 1 : undefined}
                max={key === "count" ? 360 : undefined}
                inputMode={key === "principal" ? "decimal" : undefined}
                maxLength={key === "notes" ? 20000 : 2000}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </div>
          ))}
          {detail && (
            <>
              <label htmlFor={`${id}-lifecycle`} className="block">
                Provider plan status
              </label>
              <select
                id={`${id}-lifecycle`}
                required
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
                value={fields.lifecycle}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    lifecycle: e.target.value as "active" | "cancelled",
                  })
                }
              >
                <option value="">Choose actual provider status</option>
                <option value="active" disabled={!detail.currentPurchase}>
                  Active provider arrangement
                </option>
                <option value="cancelled">
                  Provider-confirmed cancellation
                </option>
              </select>
              <label htmlFor={`${id}-reason`} className="block">
                Required schedule correction reason
              </label>
              <Input
                id={`${id}-reason`}
                value={fields.reason}
                maxLength={20000}
                required
                onChange={(e) =>
                  setFields({ ...fields, reason: e.target.value })
                }
              />
            </>
          )}
          {rows.map((row, n) => (
            <fieldset
              key={n}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <legend>Installment {n + 1}</legend>
              {(
                [
                  ["dueDate", "Provider due date (optional)"],
                  ["principal", `Expected principal (${setup.card.currency})`],
                  [
                    "interest",
                    `Expected interest (${setup.card.currency}, optional)`,
                  ],
                  ["fee", `Expected fee (${setup.card.currency}, optional)`],
                  [
                    "total",
                    `Provider total (${setup.card.currency}, optional)`,
                  ],
                  ["reference", "Installment provider reference (optional)"],
                  ["notes", "Installment notes (optional)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`${id}-${n}-${key}`} className="block">
                    {label}
                  </label>
                  <Input
                    id={`${id}-${n}-${key}`}
                    value={row[key]}
                    type={key === "dueDate" ? "date" : "text"}
                    inputMode={
                      ["principal", "interest", "fee", "total"].includes(key)
                        ? "decimal"
                        : undefined
                    }
                    required={key === "principal"}
                    maxLength={2000}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, index) =>
                          index === n ? { ...r, [key]: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={rows.length === 1}
                className="whitespace-normal"
                onClick={() => setRows(rows.filter((_, index) => index !== n))}
              >
                Remove installment {n + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= 360}
            className="whitespace-normal"
            onClick={() => setRows([...rows, emptyRow()])}
          >
            Add provider installment line
          </Button>
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              required
              checked={fields.confirmed}
              onChange={(e) =>
                setFields({ ...fields, confirmed: e.target.checked })
              }
            />
            I confirm this complete schedule and status against actual provider
            records. Unknown amounts are not inferred.
          </label>
          <Button type="submit" className="whitespace-normal">
            Review installment evidence
          </Button>
        </fieldset>
      </form>
      <CardEvidenceCommandReview command={command} />
    </div>
  );
}
export function CardInstallmentApplicationForm({ detail }: { detail: Detail }) {
  const id = useId(),
    base = `/money/cards/${detail.card.cardId}/installments/${detail.planId}`,
    command = useCardEvidenceCommand(base, "applicationId");
  const [fields, setFields] = useState({
      allocation: "",
      installment: "1",
      principal: "",
      interest: "",
      fee: "",
      interestSource: "",
      feeSource: "",
      kind: "provider",
      source: "",
      date: detail.asOfDate,
      confirmed: false,
    }),
    [reason, setReason] = useState("");
  const money = (v: string) => formatMoneyMinorUnits(detail.card.currency, v),
    locked = !!command.pending;
  return (
    <div className="space-y-5 break-words">
      <p>
        Confirm an installment application only from an existing confirmed
        statement allocation. Interest and fees additionally require actual
        recorded charges. This confirmation does not make another payment or
        recognize spending.
      </p>
      <form
        hidden={command.pending !== null}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (!fields.confirmed)
              throw Error("Confirm the actual application.");
            const b = cardInstallmentApplicationSchema.parse({
              clientCommandId: crypto.randomUUID(),
              planRevisionId: detail.revisionId,
              installmentNo: Number(fields.installment),
              allocationId: fields.allocation,
              principalMinor: fields.principal.trim()
                ? parseInstallmentAmount(fields.principal)
                : "0",
              interestMinor: fields.interest.trim()
                ? parseInstallmentAmount(fields.interest)
                : "0",
              feeMinor: fields.fee.trim()
                ? parseInstallmentAmount(fields.fee)
                : "0",
              interestActionRevisionId: fields.interestSource || null,
              feeActionRevisionId: fields.feeSource || null,
              confirmationKind: fields.kind,
              confirmationSource: fields.source,
              confirmedDate: fields.date,
            });
            command.prepare({
              path: `/api/v1/credit-cards/${detail.card.cardId}/installments/${detail.planId}/applications`,
              body: b,
              summary: [
                `Confirm application to installment ${b.installmentNo}`,
                `Principal ${money(b.principalMinor)}; interest ${money(b.interestMinor)}; fee ${money(b.feeMinor)}`,
                `Confirmed ${b.confirmedDate}: ${b.confirmationSource}`,
                "No new payment, financial posting or guessed provider allocation.",
              ],
            });
          } catch {
            command.setError(
              "Confirm a supported allocation, exact positive portions, actual charge references and evidence.",
            );
          }
        }}
      >
        <fieldset
          disabled={locked || !detail.status.eligible}
          className="space-y-4"
        >
          <legend className="font-semibold">
            Confirm installment satisfaction
          </legend>
          <label htmlFor={`${id}-allocation`} className="block">
            Confirmed statement allocation
          </label>
          <select
            id={`${id}-allocation`}
            required
            value={fields.allocation}
            className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
            onChange={(e) =>
              setFields({ ...fields, allocation: e.target.value })
            }
          >
            <option value="">Choose confirmed allocation evidence</option>
            {detail.allocationChoices.items.map((a) => (
              <option
                key={a.allocationId}
                value={a.allocationId}
                disabled={BigInt(a.availableMinor) === 0n}
              >
                {a.description} — statement {a.statementDate} — available{" "}
                {money(a.availableMinor)}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-installment`} className="block">
            Provider installment
          </label>
          <select
            id={`${id}-installment`}
            required
            value={fields.installment}
            className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
            onChange={(e) =>
              setFields({ ...fields, installment: e.target.value })
            }
          >
            {detail.lines.map((l) => (
              <option key={l.sequenceNo} value={l.sequenceNo}>
                Installment {l.sequenceNo} — due {l.dueDate ?? "Unknown"}
              </option>
            ))}
          </select>
          {(
            [
              ["principal", `Applied principal (${detail.card.currency})`],
              ["interest", `Applied interest (${detail.card.currency})`],
              ["fee", `Applied fee (${detail.card.currency})`],
              ["source", "Application confirmation source"],
              ["date", "Application confirmation date"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="block">
                {label}
              </label>
              <Input
                id={`${id}-${key}`}
                value={fields[key]}
                required={key === "source" || key === "date"}
                type={key === "date" ? "date" : "text"}
                inputMode={
                  ["principal", "interest", "fee"].includes(key)
                    ? "decimal"
                    : undefined
                }
                maxLength={2000}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </div>
          ))}
          {(
            [
              [
                "interestSource",
                "Actual recorded card interest",
                "card_interest",
              ],
              ["feeSource", "Actual recorded card fee", "card_fee"],
            ] as const
          ).map(([key, label, kind]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="block">
                {label}
              </label>
              <select
                id={`${id}-${key}`}
                value={fields[key]}
                className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              >
                <option value="">No charge portion applied</option>
                {detail.chargeChoices.items
                  .filter((c) => c.actionKind === kind)
                  .map((c) => (
                    <option key={c.actionRevisionId} value={c.actionRevisionId}>
                      {c.description} — available {money(c.availableMinor)}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <label htmlFor={`${id}-kind`} className="block">
            Application confirmed by
          </label>
          <select
            id={`${id}-kind`}
            value={fields.kind}
            className="min-h-11 w-full rounded-md border border-border bg-surface p-2"
            onChange={(e) => setFields({ ...fields, kind: e.target.value })}
          >
            <option value="provider">Provider confirmed records</option>
            <option value="user">User confirmed records</option>
          </select>
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              required
              checked={fields.confirmed}
              onChange={(e) =>
                setFields({ ...fields, confirmed: e.target.checked })
              }
            />
            I confirm the exact installment and component application; no
            provider order is assumed.
          </label>
          <Button type="submit" className="whitespace-normal">
            Review installment application
          </Button>
        </fieldset>
      </form>
      <label htmlFor={`${id}-reason`} className="block">
        Installment application reversal reason
      </label>
      <Input
        id={`${id}-reason`}
        value={reason}
        disabled={locked}
        maxLength={2000}
        onChange={(e) => setReason(e.target.value)}
      />
      <ul className="space-y-3">
        {detail.applications.items.map((a) => (
          <li key={a.applicationId} className="border-b border-border py-3">
            <p>
              Revision {a.version}, installment {a.installmentNo}: principal{" "}
              {money(a.principalMinor)}, interest {money(a.interestMinor)}, fee{" "}
              {money(a.feeMinor)} — {a.status} — {a.confirmationSource}
            </p>
            {a.reversesApplicationId === null && a.status !== "reversed" && (
              <Button
                type="button"
                variant="secondary"
                className="whitespace-normal"
                disabled={locked}
                onClick={() => {
                  try {
                    const b = reverseInstallmentApplicationSchema.parse({
                      clientCommandId: crypto.randomUUID(),
                      applicationId: a.applicationId,
                      reason,
                    });
                    command.prepare({
                      path: `/api/v1/credit-cards/${detail.card.cardId}/installments/${detail.planId}/applications/reversals`,
                      body: b,
                      summary: [
                        `Reverse original installment application ${money((BigInt(a.principalMinor) + BigInt(a.interestMinor) + BigInt(a.feeMinor)).toString())}`,
                        `Reason: ${reason}`,
                        "Preserve original evidence; no money movement.",
                      ],
                    });
                  } catch {
                    command.setError(
                      "Enter a reason before reversing the original application.",
                    );
                  }
                }}
              >
                Review application reversal
              </Button>
            )}
          </li>
        ))}
      </ul>
      <CardEvidenceCommandReview command={command} />
    </div>
  );
}
