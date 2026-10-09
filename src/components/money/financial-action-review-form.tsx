"use client";
import { useEffect, useRef, useState } from "react";
import { useClientReady } from "@/shared/use-client-ready";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  correctFinancialActionBodySchema,
  financialMutationResultSchema,
  refundIntentSchema,
  resolveClearingBodySchema,
  reverseFinancialActionBodySchema,
  type ReplacementIntent,
} from "@/modules/finance/domain/financial-correction";
import type { getFinancialActionDetailInTransaction } from "@/modules/finance/services/correct-financial-action";
import type { FinancialAccountListItem } from "@/modules/finance/services/list-financial-accounts";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { formatMoneyMinorUnits } from "@/shared/money-display";
type Detail = Awaited<ReturnType<typeof getFinancialActionDetailInTransaction>>;
type Category = { categoryId: string; name: string; kind: string };
type Draft = Record<string, unknown>;
const labels: Record<string, string> = {
  effectiveDate: "Effective date",
  paymentDate: "Payment date",
  fundingAccountId: "Paying account",
  receivingAccountId: "Receiving account",
  payingAccountId: "Paying account",
  sourceAccountId: "Source account",
  destinationAccountId: "Destination account",
  financialAccountId: "Financial account",
  purchaseMinor: "Purchase amount",
  amountMinor: "Amount",
  destinationPrincipalMinor: "Principal received at destination",
  principalMinor: "Recognized principal",
  actualReceivedMinor: "Actual cash received",
  actualPaidMinor: "Actual cash paid",
  contractualMinor: "Contractual payment",
  externalFeeMinor: "External payment fee",
  unappliedContractualMinor: "Explicit unapplied contractual amount",
  signedAdjustmentMinor: "Signed balance adjustment",
  splits: "Category portions",
  fees: "Fees",
  components: "Accounting components",
  dueAllocations: "Contractual due allocations",
  allocations: "Refund portions",
  categoryId: "Category",
  externalFeeCategoryId: "External fee category",
  bearingAccountId: "Fee paying account",
  liabilityComponent: "Recognized liability component",
  sourceComponentId: "Original payment clearing portion",
  originalPurchasePostingId: "Original purchase / fee portion",
  allocationKind: "Refund portion kind",
  installmentId: "Scheduled due",
  allocationCertainty: "Accounting certainty",
  disposition: "Accounting treatment",
  component: "Recognized charge component",
  confirmationSource: "Confirmation source",
  confirmationNote: "Confirmation note",
  externalFeeLabel: "External fee label",
  merchantName: "Merchant",
  senderName: "Sender",
  sourceLabel: "Income source",
  incomeClass: "Income classification",
  treatment: "Fee treatment",
  description: "Description",
  reference: "Provider / receipt reference",
  notes: "Notes",
  memo: "Memo",
  label: "Label",
};
const hidden = new Set([
  "actionKind",
  "debtId",
  "scheduleVersionId",
  "expectedFinancialRevision",
  "dueAllocationConfirmed",
  "providerConfirmed",
  "acknowledgeNegativeBalance",
]);
const options: Record<string, string[]> = {
  incomeClass: ["earned", "gift", "reward", "other"],
  treatment: ["withheld", "source_additional", "separate", "capitalized"],
  liabilityComponent: [
    "principal",
    "interest",
    "fee",
    "penalty",
    "unclassified",
  ],
  component: ["interest", "fee", "penalty"],
  disposition: [
    "liability_reduction",
    "new_interest",
    "new_fee",
    "new_penalty",
    "clearing",
    "advance",
  ],
  allocationCertainty: ["known_components", "confirmed_total", "unresolved"],
  confirmationSource: ["user", "provider"],
  allocationKind: ["purchase", "fee"],
};
function decimal(v: string) {
  const n = BigInt(v),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
function transform(value: unknown, toMinor: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => transform(v, toMinor));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k.endsWith("Minor") && typeof v === "string"
          ? toMinor
            ? (v.startsWith("-")
                ? -parsePhpAmountToMinorUnits(v.slice(1))
                : parsePhpAmountToMinorUnits(v)
              ).toString()
            : decimal(v)
          : transform(v, toMinor),
      ]),
    );
  return value;
}
export function correctionCashEffects(
  p: ReplacementIntent,
): Array<{ accountId: string; effectiveDate: string; signedMinor: string }> {
  if (p.actionKind === "income" || p.actionKind === "borrowing")
    return [
      {
        accountId: p.receivingAccountId,
        effectiveDate: p.effectiveDate,
        signedMinor:
          p.actionKind === "income" ? p.amountMinor : p.actualReceivedMinor,
      },
    ];
  if (p.actionKind === "expense")
    return [
      {
        accountId: p.fundingAccountId,
        effectiveDate: p.effectiveDate,
        signedMinor: (-BigInt(p.purchaseMinor)).toString(),
      },
    ];
  if (p.actionKind === "refund")
    return [
      {
        accountId: p.receivingAccountId,
        effectiveDate: p.effectiveDate,
        signedMinor: p.allocations
          .reduce((s, a) => s + BigInt(a.amountMinor), 0n)
          .toString(),
      },
    ];
  if (p.actionKind === "debt_payment")
    return [
      {
        accountId: p.payingAccountId,
        effectiveDate: p.paymentDate,
        signedMinor: (-BigInt(p.actualPaidMinor)).toString(),
      },
    ];
  if (p.actionKind === "balance_adjustment")
    return [
      {
        accountId: p.financialAccountId,
        effectiveDate: p.effectiveDate,
        signedMinor: p.signedAdjustmentMinor,
      },
    ];
  if (
    p.actionKind === "debt_charge" ||
    p.actionKind === "opening_debt" ||
    p.actionKind === "payment_reclassification"
  )
    return [];
  if (p.actionKind === "opening_cash")
    return [
      {
        accountId: p.financialAccountId,
        effectiveDate: p.effectiveDate,
        signedMinor: p.amountMinor,
      },
    ];
  return [
    {
      accountId: p.sourceAccountId,
      effectiveDate: p.effectiveDate,
      signedMinor: (-BigInt(p.destinationPrincipalMinor)).toString(),
    },
    {
      accountId: p.destinationAccountId,
      effectiveDate: p.effectiveDate,
      signedMinor: p.destinationPrincipalMinor,
    },
    ...p.fees.map((f) => ({
      accountId: f.bearingAccountId ?? p.sourceAccountId,
      effectiveDate: f.effectiveDate ?? p.effectiveDate,
      signedMinor: (-BigInt(f.amountMinor)).toString(),
    })),
  ];
}
export function FinancialActionReviewForm({
  detail: provided,
  accounts: providedAccounts,
  categories: providedCategories,
  today,
}: {
  detail: Detail;
  accounts: FinancialAccountListItem[];
  categories: Category[];
  today: string;
}) {
  const [accounts] = useState(() => structuredClone(providedAccounts)),
    [categories] = useState(() => structuredClone(providedCategories)),
    [detail] = useState(() => structuredClone(provided)),
    [mode, setMode] = useState<"correct" | "reverse" | "refund" | "resolve">(
      "correct",
    ),
    [draft, setDraft] = useState<Draft>(
      () => transform(detail.replacement ?? {}, false) as Draft,
    ),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [stage, setStage] = useState<
      "editing" | "reviewing" | "saving" | "unconfirmed" | "saved" | "stale"
    >("editing"),
    [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
      body: Draft;
      url: string;
      effects: Array<{
        accountId: string;
        effectiveDate: string;
        signedMinor: string;
      }>;
    } | null>(null),
    busy = useRef(false);
  const changed =
    provided.current.actionRevisionId !== detail.current.actionRevisionId ||
    provided.current.financialRevision !== detail.current.financialRevision;
  const clientReady = useClientReady();
  const locked = stage !== "editing" || changed || !clientReady;
  useEffect(() => {
    if (stage !== "saving" && stage !== "unconfirmed") return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault(),
      navigation = (e: MouseEvent) => {
        if ((e.target as Element).closest("a[href]")) {
          e.preventDefault();
          setError(
            "Resolve this save by retrying the identical command before leaving.",
          );
        }
      };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, [stage]);
  function selectMode(value: typeof mode) {
    setMode(value);
    setReason("");
    setAck(false);
    setConfirmed(false);
    setError(null);
    setPending(null);
    setDraft(
      value === "resolve"
        ? {
            actionKind: "payment_reclassification",
            sourceComponentId:
              detail.clearingSources[0]?.sourceComponentId ?? "",
            effectiveDate: today,
            components: [],
            providerConfirmed: true,
            description: "Provider confirms payment classification",
          }
        : value === "refund"
          ? {
              actionKind: "refund",
              purchaseActionId: detail.current.actionId,
              receivingAccountId:
                accounts.find((a) => !a.archived)?.accountId ?? "",
              effectiveDate: today,
              allocations: [],
              description: "Purchase refund",
              reference: null,
              notes: null,
            }
          : (transform(detail.replacement ?? {}, false) as Draft),
    );
  }
  function edit(next: Draft) {
    setDraft(next);
    setAck(false);
    setConfirmed(false);
  }
  function renderFields(
    value: Draft,
    onChange: (v: Draft) => void,
    prefix: string,
  ) {
    return Object.entries(value)
      .filter(([key]) => !hidden.has(key) && key !== "purchaseActionId")
      .map(([key, v]) => {
        const name = labels[key] ?? key,
          id = `${prefix}-${key}`;
        if (Array.isArray(v))
          return (
            <fieldset
              key={key}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <legend>{name}</legend>
              {v.map((row, index) => (
                <div
                  key={index}
                  className="space-y-2 border-b border-border pb-3"
                >
                  {renderFields(
                    row as Draft,
                    (next) =>
                      onChange({
                        ...value,
                        [key]: v.map((r, i) => (i === index ? next : r)),
                      }),
                    `${id}-${index}`,
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={locked}
                    onClick={() =>
                      onChange({
                        ...value,
                        [key]: v.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove {name.toLowerCase()} {index + 1}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                onClick={() => {
                  const templates: Record<string, Draft> = {
                    splits: {
                      amountMinor: "0.00",
                      categoryId: null,
                      memo: null,
                    },
                    fees: {
                      label: "Fee",
                      amountMinor: "0.00",
                      treatment:
                        draft.actionKind === "borrowing"
                          ? "capitalized"
                          : "source_additional",
                      categoryId: null,
                      ...(draft.actionKind === "transfer"
                        ? {
                            effectiveDate: draft.effectiveDate,
                            bearingAccountId: draft.sourceAccountId,
                          }
                        : {}),
                    },
                    components:
                      draft.actionKind === "opening_debt"
                        ? {
                            amountMinor: "0.00",
                            liabilityComponent: "unclassified",
                          }
                        : {
                            disposition: "liability_reduction",
                            amountMinor: "0.00",
                            liabilityComponent: "unclassified",
                            categoryId: null,
                            label: "Provider confirmed component",
                          },
                    dueAllocations: {
                      installmentId:
                        detail.installments[0]?.installmentId ?? "",
                      amountMinor: "0.00",
                    },
                    allocations: {
                      originalPurchasePostingId:
                        detail.refundSources[0]?.postingId ?? "",
                      amountMinor: "0.00",
                      allocationKind:
                        detail.refundSources[0]?.allocationKind ?? "purchase",
                    },
                  };
                  onChange({ ...value, [key]: [...v, templates[key] ?? {}] });
                }}
              >
                Add {name.toLowerCase()}
              </Button>
            </fieldset>
          );
        const account = key.endsWith("AccountId"),
          category = key.endsWith("CategoryId") || key === "categoryId",
          enumOptions = options[key],
          source = key === "originalPurchasePostingId",
          clearing = key === "sourceComponentId",
          due = key === "installmentId";
        const choices = account
          ? accounts.map((a) => ({
              id: a.accountId,
              name: `${a.name}${a.archived ? " (archived)" : ""}`,
            }))
          : category
            ? categories
                .filter(
                  (c) =>
                    c.kind ===
                    (draft.actionKind === "income" ? "income" : "expense"),
                )
                .map((c) => ({ id: c.categoryId, name: c.name }))
            : source
              ? detail.refundSources.map((s) => ({
                  id: s.postingId,
                  name: `${s.allocationKind}: ${s.categoryName ?? "Uncategorized"} — eligible ${formatMoneyMinorUnits(detail.current.currency, s.remainingMinor)}`,
                }))
              : clearing
                ? detail.clearingSources.map((c) => ({
                    id: c.sourceComponentId,
                    name: `Payment ${c.paymentDate}: remaining clearing ${formatMoneyMinorUnits(detail.current.currency, c.remainingMinor)}`,
                  }))
                : due
                  ? detail.installments.map((i) => ({
                      id: i.installmentId,
                      name: i.label,
                    }))
                  : enumOptions?.map((o) => ({
                      id: o,
                      name: o.replaceAll("_", " "),
                    }));
        return (
          <label key={key} htmlFor={id} className="block space-y-1 text-sm">
            <span>{name}</span>
            {choices ? (
              <select
                id={id}
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
                disabled={locked}
                value={typeof v === "string" ? v : ""}
                onChange={(e) =>
                  onChange({ ...value, [key]: e.target.value || null })
                }
              >
                <option value="">
                  {category ? "Uncategorized" : "Select"}
                </option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type={key.toLowerCase().endsWith("date") ? "date" : "text"}
                inputMode={key.endsWith("Minor") ? "decimal" : undefined}
                disabled={locked}
                value={typeof v === "string" ? v : ""}
                onChange={(e) =>
                  onChange({ ...value, [key]: e.target.value || null })
                }
              />
            )}
          </label>
        );
      });
  }
  function review() {
    try {
      const base = {
        clientCommandId: crypto.randomUUID(),
        expectedActionRevisionId: detail.current.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason,
        acknowledgeNegativeBalance: ack,
      };
      let body: Draft,
        effects: Array<{
          accountId: string;
          effectiveDate: string;
          signedMinor: string;
        }>,
        url: string;
      if (mode === "reverse") {
        body = reverseFinancialActionBodySchema.parse(base);
        effects = [];
        url = `/api/v1/financial-actions/${detail.current.actionId}/reversals`;
      } else if (mode === "resolve") {
        const converted = transform(draft, true) as Draft;
        const { actionKind: _kind, ...resolution } = converted;
        void _kind;
        body = resolveClearingBodySchema.parse({
          ...resolution,
          clientCommandId: base.clientCommandId,
          expectedFinancialRevision: base.expectedFinancialRevision,
          reason,
        });
        effects = [];
        url = "/api/v1/payment-reclassifications";
      } else {
        const converted = transform(draft, true) as Draft,
          p =
            mode === "refund"
              ? refundIntentSchema.parse({
                  ...converted,
                  acknowledgeNegativeBalance: ack,
                })
              : correctFinancialActionBodySchema.parse({
                  clientCommandId: base.clientCommandId,
                  expectedActionRevisionId: base.expectedActionRevisionId,
                  expectedFinancialRevision: base.expectedFinancialRevision,
                  reason,
                  replacement: {
                    ...converted,
                    acknowledgeNegativeBalance: ack,
                    ...(draft.actionKind === "debt_payment"
                      ? { dueAllocationConfirmed: true }
                      : {}),
                  },
                }).replacement;
        effects = correctionCashEffects(p);
        if (mode === "refund") {
          const { actionKind: _kind, ...intent } = p;
          void _kind;
          body = { clientCommandId: base.clientCommandId, ...intent };
          url = "/api/v1/refunds";
        } else {
          body = {
            clientCommandId: base.clientCommandId,
            expectedActionRevisionId: base.expectedActionRevisionId,
            expectedFinancialRevision: base.expectedFinancialRevision,
            reason,
            replacement: p,
          };
          url = `/api/v1/financial-actions/${detail.current.actionId}/corrections`;
        }
      }
      setPending({ body: structuredClone(body), url, effects });
      setStage("reviewing");
      setConfirmed(false);
      setError(null);
    } catch {
      setError(
        "Review all required amounts, category portions, dates, fee treatments and confirmations. A correction or reversal requires a reason.",
      );
    }
  }
  async function save() {
    if (!pending || busy.current || (changed && stage !== "unconfirmed"))
      return;
    busy.current = true;
    setStage("saving");
    setError(null);
    const abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(pending.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body),
        signal: abort.signal,
      });
      if (response.status >= 500) throw new Error("uncertain");
      const data: unknown = await response.json();
      if (!response.ok) {
        setStage(response.status === 409 ? "stale" : "editing");
        setPending(null);
        setConfirmed(false);
        setAck(false);
        setError(
          typeof data === "object" &&
            data &&
            "message" in data &&
            typeof data.message === "string"
            ? data.message
            : "The command was rejected. Review current evidence before retrying.",
        );
        return;
      }
      const result = financialMutationResultSchema.safeParse(data);
      if (
        !result.success ||
        (mode !== "refund" &&
          mode !== "resolve" &&
          result.data.actionId !== detail.current.actionId)
      )
        throw new Error("uncertain");
      setStage("saved");
    } catch {
      setStage("unconfirmed");
      setError(
        "Save outcome unconfirmed. Keep this page open and retry the identical command before recording another action.",
      );
    } finally {
      clearTimeout(timeout);
      busy.current = false;
    }
  }
  const balances = pending
    ? accounts
        .map((account) => {
          const old =
              mode === "refund" || mode === "resolve"
                ? 0n
                : detail.cashEffects
                    .filter((e) => e.accountId === account.accountId)
                    .reduce((s, e) => s + BigInt(String(e.signedMinor)), 0n),
            next = pending.effects
              .filter((e) => e.accountId === account.accountId)
              .reduce((s, e) => s + BigInt(e.signedMinor), 0n);
          return {
            account,
            old,
            next,
            after: BigInt(account.currentBalanceMinor) - old + next,
          };
        })
        .filter((r) => r.old !== 0n || r.next !== 0n)
    : [];
  return (
    <Panel
      title="Review financial evidence"
      description="Corrections preserve originals, reverse their signed classifications at their original dates, and post replacement economics at the corrected dates. Genuine refunds retain the purchase and use their actual later date."
    >
      {changed && (
        <p role="alert">
          Financial evidence changed. Reload this page before reviewing another
          command.
        </p>
      )}
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3">
          {detail.replacement && (
            <Button
              type="button"
              variant="secondary"
              disabled={locked || Boolean(detail.correctionUnavailableReason)}
              onClick={() => selectMode("correct")}
            >
              Correct entry
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={locked || Boolean(detail.reversalUnavailableReason)}
            onClick={() => selectMode("reverse")}
          >
            Reverse entry
          </Button>
          {detail.current.actionKind !== "refund" &&
            detail.refundSources.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                onClick={() => selectMode("refund")}
              >
                Record genuine refund
              </Button>
            )}
          {detail.current.actionKind === "debt_payment" &&
            detail.clearingSources.some(
              (c) => BigInt(c.remainingMinor) > 0n,
            ) && (
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                onClick={() => selectMode("resolve")}
              >
                Resolve payment clearing
              </Button>
            )}
        </div>
        {(detail.correctionUnavailableReason ||
          detail.reversalUnavailableReason) && (
          <p role="status">
            {detail.correctionUnavailableReason ??
              detail.reversalUnavailableReason}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
          className="space-y-4"
        >
          <p>
            Selected action:{" "}
            {mode === "resolve"
              ? "Later provider-confirmed classification with zero cash movement"
              : mode === "refund"
                ? "Genuine later refund"
                : mode === "reverse"
                  ? "Explicit reversal"
                  : "Correction and replacement"}
          </p>
          {draft.actionKind === "debt_payment" &&
            detail.current.evidence.scheduleVersionId !==
              draft.scheduleVersionId && (
              <p>
                Review every contractual allocation below. Changing this mapped
                payment amount or allocation creates an allocation-correction
                schedule version with the same obligations, dates and terms.
                Previous schedules and allocation maps remain in history.
              </p>
            )}
          {mode !== "reverse" && renderFields(draft, edit, "financial-edit")}
          {mode !== "refund" && (
            <label className="block">
              Required reason
              <Input
                disabled={locked}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setAck(false);
                }}
              />
            </label>
          )}
          <label className="flex items-start gap-3 rounded-md border border-warning p-3">
            <input
              type="checkbox"
              disabled={locked}
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              I explicitly acknowledge that this genuine command may create a
              negative tracked balance, including in a historical period. This
              acknowledgement is preserved with the command.
            </span>
          </label>
          {stage === "editing" && (
            <Button
              type="submit"
              disabled={
                !clientReady ||
                changed ||
                (mode === "correct" &&
                  (!detail.replacement ||
                    Boolean(detail.correctionUnavailableReason))) ||
                (mode === "reverse" &&
                  Boolean(detail.reversalUnavailableReason))
              }
            >
              Review exact changes
            </Button>
          )}
        </form>
        {pending && (
          <section
            aria-label="Exact financial review"
            className="space-y-4 rounded-md border border-border p-4"
          >
            <h3 className="font-semibold">Exact financial review</h3>
            <p>
              {mode === "resolve"
                ? `Original payment remains on ${detail.current.effectiveDate}; this classification creates no cash movement.`
                : mode === "refund"
                  ? `Original purchase remains on ${detail.current.effectiveDate}.`
                  : `Cancel the current economics at their original dates, including ${detail.current.effectiveDate}.`}{" "}
              {mode !== "reverse" &&
                `New effective date: ${String(draft.paymentDate ?? draft.effectiveDate)}.`}
            </p>
            <p>Reason: {reason || "Genuine later refund"}</p>
            <p>
              Backdated changes affect historical balances, category spending
              and reconciliation comparisons. Previously verified affected
              comparisons will need review.
            </p>
            <table className="w-full text-left text-sm">
              <caption>Current account balance after this command</caption>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((r) => (
                  <tr key={r.account.accountId}>
                    <td>{r.account.name}</td>
                    <td>
                      {formatMoneyMinorUnits(
                        r.account.currency,
                        r.account.currentBalanceMinor,
                      )}
                    </td>
                    <td>
                      {formatMoneyMinorUnits(
                        r.account.currency,
                        r.after.toString(),
                      )}
                      {r.after < 0n ? " — negative balance" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              {pending.effects.map((e, i) => (
                <li key={i}>
                  {accounts.find((a) => a.accountId === e.accountId)?.name ??
                    "Account"}
                  :{" "}
                  {formatMoneyMinorUnits(
                    detail.current.currency,
                    e.signedMinor,
                  )}{" "}
                  effective {e.effectiveDate}
                </li>
              ))}
            </ul>
            {detail.replacement && (
              <div
                aria-label="Before accounting and current contractual allocation"
                className="space-y-2 rounded-md border border-border p-3"
              >
                <h4 className="font-semibold">
                  Before accounting and current contractual allocation
                </h4>
                {renderFields(
                  transform(detail.replacement, false) as Draft,
                  () => {},
                  "financial-before",
                )}
              </div>
            )}
            {mode !== "reverse" && (
              <div
                aria-label="Reviewed replacement or later action"
                className="space-y-2 rounded-md border border-border p-3"
              >
                <h4 className="font-semibold">
                  {mode === "correct" ? "Replacement" : "New later action"}
                </h4>
                {renderFields(draft, () => {}, "financial-review")}
              </div>
            )}
            <p>
              Principal repayment is not spending. Only newly recognized
              interest and fees are expenses. A purchase or fee refund offsets
              spending and creates no income.
            </p>
            {(draft.actionKind === "payment_reclassification" ||
              draft.actionKind === "debt_charge") && (
              <p>
                Confirm that the provider supplied the amounts and accounting
                classification shown above.
              </p>
            )}
            <label className="flex gap-3">
              <input
                type="checkbox"
                disabled={stage !== "reviewing"}
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm the exact dates, account effects, category and
                accounting components, and all visible contractual allocations
                and explicit unapplied amounts.
              </span>
            </label>
            {stage === "reviewing" && (
              <div className="flex gap-3">
                <Button
                  disabled={
                    !confirmed || (balances.some((r) => r.after < 0n) && !ack)
                  }
                  onClick={() => void save()}
                >
                  Confirm and save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStage("editing");
                    setPending(null);
                    setAck(false);
                    setConfirmed(false);
                  }}
                >
                  Edit review
                </Button>
              </div>
            )}
            {stage === "unconfirmed" && (
              <Button onClick={() => void save()}>
                Retry identical command
              </Button>
            )}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        {stage === "saving" && <p role="status">Saving financial command…</p>}
        {stage === "saved" && (
          <p role="status">
            Financial command saved. Reload to view the current revision and
            preserved history.
          </p>
        )}
        {stage === "stale" && (
          <p role="status">
            Reload and review current financial evidence before issuing a new
            command.
          </p>
        )}
      </div>
    </Panel>
  );
}
