"use client";
import Link from "next/link";
import { useState } from "react";
import type { GroupDetail } from "@/modules/sharing/services/read-groups";
import {
  obligationFor,
  previewSettlement,
} from "@/modules/sharing/domain/balances";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { Input } from "@/components/ui/input";
import { CommandForm, Field, selectClass } from "./forms";
import { money } from "./bill-form";
import { PrivateFollowup } from "./private-followup";

export function SettlementPanel({ data }: { data: GroupDetail }) {
  const { group, ledger } = data;
  const [recipient, setRecipient] = useState(
      data.participants.find((p) => p.id !== group.participantId)?.id ?? "",
    ),
    [mode, setMode] = useState("full"),
    [custom, setCustom] = useState(""),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [filter, setFilter] = useState("all");
  if (!ledger) return null;
  const name = (id: string) =>
    data.participants.find((p) => p.id === id)?.displayName ??
    "Historical participant";
  const due = obligationFor(ledger.edges, group.participantId, recipient),
    full = due > 0n ? due : 0n;
  const amount = mode === "full" ? exactDecimal(full.toString()) : custom;
  let preview: ReturnType<typeof previewSettlement> | null = null,
    error = "";
  try {
    if (amount)
      preview = previewSettlement(
        ledger.sources,
        ledger.settlements,
        group.participantId,
        recipient,
        parsePhpAmountToMinorUnits(amount).toString(),
        mode === "selected"
          ? Object.entries(selected)
              .filter(([, a]) => a.trim())
              .map(([expenseId, a]) => ({
                expenseId,
                sourceRevisionId: ledger.sources.find(
                  (p) => p.expenseId === expenseId,
                )!.revisionId,
                amountMinor: parsePhpAmountToMinorUnits(a).toString(),
              }))
          : undefined,
      );
  } catch (e) {
    error = e instanceof Error ? e.message : "Review the payment.";
  }
  const bills = [...new Set(ledger.sources.map((s) => s.expenseId))]
    .map((expenseId) => ({
      expenseId,
      due: obligationFor(
        ledger.edges,
        group.participantId,
        recipient,
        expenseId,
      ),
    }))
    .filter((b) => b.due > 0n);
  const pending = ledger.settlements.filter((s) => s.state === "pending");
  return (
    <section className="space-y-5" aria-labelledby="settlements-title">
      <h2 id="settlements-title" className="text-xl font-semibold">
        Settlements and group report
      </h2>
      <p>
        Confirmed balances include only confirmed payments. Pending reports
        remain separate. Money moves outside this app.
      </p>
      <p>
        Group pending reports: {pending.length} ·{" "}
        {money(
          pending.reduce((n, s) => n + BigInt(s.amountMinor), 0n).toString(),
        )}
        . Disputed reports:{" "}
        {money(
          ledger.settlements
            .filter((s) => s.state === "disputed")
            .reduce((n, s) => n + BigInt(s.amountMinor), 0n)
            .toString(),
        )}
        ; excluded from confirmed balances.
      </p>
      <p>
        Pending outgoing:{" "}
        {money(
          pending
            .filter((s) => s.senderId === group.participantId)
            .reduce((n, s) => n + BigInt(s.amountMinor), 0n)
            .toString(),
        )}{" "}
        · Pending incoming:{" "}
        {money(
          pending
            .filter((s) => s.recipientId === group.participantId)
            .reduce((n, s) => n + BigInt(s.amountMinor), 0n)
            .toString(),
        )}
      </p>
      <p>
        Your confirmed net:{" "}
        {money(
          ledger.positions.find((p) => p.participantId === group.participantId)
            ?.netMinor ?? "0",
        )}{" "}
        · Projected net if all pending reports confirm:{" "}
        {money(
          ledger.projected.positions.find(
            (p) => p.participantId === group.participantId,
          )?.netMinor ?? "0",
        )}
      </p>
      <details open className="rounded-card bg-[var(--teal-surface)] p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Pairwise balances and explanations
        </summary>
        <p>
          Attribution policy 1: offset each person’s own contribution and share,
          then match debtors and creditors by participant ID within each bill
          after refunds. Reciprocal obligations cancel across bills. Original
          records remain unchanged.
        </p>
        <ul className="space-y-3">
          {ledger.pairs.map((p) => (
            <li key={p.firstId + p.secondId}>
              <p>
                {BigInt(p.firstOwesSecondMinor) < 0n
                  ? `${name(p.secondId)} owes ${name(p.firstId)}`
                  : `${name(p.firstId)} owes ${name(p.secondId)}`}
                :{" "}
                {money(
                  (BigInt(p.firstOwesSecondMinor) < 0n
                    ? -BigInt(p.firstOwesSecondMinor)
                    : BigInt(p.firstOwesSecondMinor)
                  ).toString(),
                )}
              </p>
              <ul>
                {p.explanations.map((e, i) => (
                  <li key={i}>
                    {e.expenseId ? (
                      <Link
                        className="text-link underline"
                        href={`/sharing/${group.id}/expenses/${e.expenseId}`}
                      >
                        {data.bills.find((b) => b.id === e.expenseId)
                          ?.description ?? "Source bill"}
                      </Link>
                    ) : (
                      "Advance/reverse position"
                    )}{" "}
                    ·{" "}
                    {e.kind === "settlement"
                      ? "Confirmed settlement"
                      : "Bill after refunds"}{" "}
                    · {name(e.senderId)} → {name(e.recipientId)}{" "}
                    {money(e.amountMinor)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer font-semibold">
          Suggested way to settle
        </summary>
        {ledger.settlements.some((s) => s.state === "disputed") && (
          <p>
            Suggestions are paused while a settlement is disputed. Review its
            evidence and explicitly cancel the incorrect report before reporting
            corrected terms.
          </p>
        )}
        <p>
          Deterministic projections from whole-group positions. Suggestions do
          not post or prove a minimum payment count. A suggestion involving
          indirect obligations requires every affected person’s explicit
          agreement. This release records direct pairwise payments; arrange
          agreement outside the app and retain source bills until an agreed
          redirection workflow is available.
        </p>
        <ul>
          {ledger.suggestions.map((s, i) => (
            <li key={i}>
              {name(s.senderId)} → {name(s.recipientId)} {money(s.amountMinor)}
              {obligationFor(ledger.edges, s.senderId, s.recipientId) <
              BigInt(s.amountMinor)
                ? " · Indirect agreement required; unavailable to record as a discharge"
                : " · Direct relationship"}
            </li>
          ))}
        </ul>
      </details>
      {group.active && !group.archived && (
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Report sending a settlement
          </summary>
          <CommandForm
            label="Report payment sent"
            build={(f) => {
              if (!preview || error)
                throw new RangeError(error || "Enter a payment amount.");
              return {
                kind: "settlement",
                groupId: group.id,
                expectedVersion: group.version,
                clientCommandId: crypto.randomUUID(),
                recipientId: recipient,
                mode,
                amountMinor: parsePhpAmountToMinorUnits(amount).toString(),
                paymentDate: f.get("paymentDate"),
                note: f.get("note") || null,
                allocations: mode === "selected" ? preview.allocations : [],
                acknowledgeAdvance: f.get("advance") === "on",
              };
            }}
          >
            <Field label="Recipient">
              <select
                className={selectClass}
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setSelected({});
                }}
                required
              >
                {data.participants
                  .filter((p) => p.id !== group.participantId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                      {p.identityKind !== "registered"
                        ? " · manual confirmation"
                        : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Settlement scope">
              <select
                className={selectClass}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="full">Full relationship balance</option>
                <option value="custom">Custom amount</option>
                <option value="selected">Selected bill allocations</option>
              </select>
            </Field>
            <Field label="Payment amount (PHP)">
              <Input
                value={amount}
                readOnly={mode === "full"}
                onChange={(e) => setCustom(e.target.value)}
                inputMode="decimal"
                required
              />
            </Field>
            {mode === "selected" &&
              bills.map((b) => (
                <Field
                  key={b.expenseId}
                  label={`${data.bills.find((x) => x.id === b.expenseId)?.description ?? b.expenseId} · outstanding ${money(b.due.toString())} · pay (PHP)`}
                >
                  <Input
                    value={selected[b.expenseId] ?? ""}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        [b.expenseId]: e.target.value,
                      })
                    }
                    inputMode="decimal"
                  />
                </Field>
              ))}
            {preview && (
              <div role="status">
                <p>
                  Confirmed relationship owed: {money(preview.dueMinor)} ·
                  Payment:{" "}
                  {money(parsePhpAmountToMinorUnits(amount).toString())} ·
                  Projected relationship owed after confirmation:{" "}
                  {money(preview.projectedRelationshipMinor)}. A negative
                  projected amount means the recipient would owe you.
                </p>
                <p>
                  Unallocated advance/reverse component:{" "}
                  {money(preview.advanceMinor)}. Pending reports may overlap;
                  the recipient must review the current sources when confirming.
                </p>
              </div>
            )}
            {error && <p role="status">{error}</p>}
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="advance" />I acknowledge any
              unallocated advance/reverse position shown above.
            </label>
            <Field label="Payment date">
              <Input type="date" name="paymentDate" required />
            </Field>
            <Field label="Shared payment note (optional)">
              <Input name="note" maxLength={2000} />
            </Field>
          </CommandForm>
        </details>
      )}
      <Field label="Settlement status">
        <select
          className={selectClass}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="incoming">Needs my confirmation</option>
          <option value="outgoing">Waiting for others</option>
          {["confirmed", "disputed", "reversed", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <ul className="space-y-4">
        {ledger.settlements
          .filter(
            (s) =>
              filter === "all" ||
              (filter === "incoming"
                ? s.state === "pending" &&
                  (s.recipientId === group.participantId ||
                    (group.owner &&
                      data.participants.find((p) => p.id === s.recipientId)
                        ?.identityKind !== "registered"))
                : filter === "outgoing"
                  ? s.state === "pending" && s.senderId === group.participantId
                  : s.state === filter),
          )
          .map((s) => {
            const manual =
              data.participants.find((p) => p.id === s.recipientId)
                ?.identityKind !== "registered";
            const operations: string[] = [];
            if (group.active && !group.archived) {
              if (
                s.state === "pending" &&
                s.recipientId === group.participantId
              )
                operations.push("confirm", "dispute");
              if (s.state === "pending" && manual && group.owner)
                operations.push("manual_confirm");
              if (
                ["pending", "disputed"].includes(s.state) &&
                [s.senderId, s.recipientId].includes(group.participantId)
              )
                operations.push("cancel");
              if (
                s.state === "confirmed" &&
                (s.recipientId === group.participantId ||
                  (manual && group.owner))
              )
                operations.push("reverse");
            }
            return (
              <li
                key={s.id}
                className={`space-y-3 rounded-card border p-5 ${s.state === "pending" ? "border-warning bg-[var(--warm-surface)]" : "border-border bg-surface"}`}
                id={`settlement-${s.id}`}
              >
                <h3 className="font-semibold">
                  {name(s.senderId)} → {name(s.recipientId)} ·{" "}
                  {money(s.amountMinor)} · {s.state}
                </h3>
                <p>
                  Payment date {s.paymentDate} · Reported{" "}
                  {s.createdAt.slice(0, 10)}
                  {manual
                    ? " · Recipient cannot authenticate now; historical confirmation evidence is shown below"
                    : ""}
                </p>
                {s.note && <p>{s.note}</p>}
                <ul>
                  {s.allocations.map((a) => (
                    <li key={a.expenseId}>
                      <Link
                        href={`/sharing/${group.id}/expenses/${a.expenseId}`}
                        className="text-link underline"
                      >
                        {data.bills.find((b) => b.id === a.expenseId)
                          ?.description ?? "Source bill"}
                      </Link>{" "}
                      · {money(a.amountMinor)} · source revision{" "}
                      {a.sourceRevisionId}
                    </li>
                  ))}
                </ul>
                <p>Advance/reverse component {money(s.advanceMinor)}</p>
                {operations.length > 0 && (
                  <details>
                    <summary className="action-link">
                      Review payment and record a decision
                    </summary>
                    <CommandForm
                      label="Record settlement transition"
                      build={(f) => ({
                        kind: "settlement_transition",
                        groupId: group.id,
                        expectedVersion: group.version,
                        clientCommandId: crypto.randomUUID(),
                        settlementId: s.id,
                        expectedSettlementVersion: s.version,
                        operation: f.get("operation"),
                        reason: f.get("reason"),
                        acknowledgeManualLimitation: f.get("manual") === "on",
                      })}
                    >
                      <Field label="Transition">
                        <select className={selectClass} name="operation">
                          {operations.map((op) => (
                            <option key={op} value={op}>
                              {op.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Transition reason">
                        <Input name="reason" required maxLength={1800} />
                      </Field>
                      {manual && (
                        <label className="flex min-h-11 items-center gap-2">
                          <input type="checkbox" name="manual" />I acknowledge
                          the recipient has no authenticated confirmation. This
                          is an owner-entered manual record.
                        </label>
                      )}
                    </CommandForm>
                  </details>
                )}
                {[s.senderId, s.recipientId].includes(group.participantId) && (
                  <Link
                    className="inline-flex min-h-11 items-center text-link underline"
                    href={`/sharing/${group.id}/effects/settlement/${s.id}`}
                  >
                    Review your private settlement movement and clearing
                  </Link>
                )}
                {group.active &&
                  [s.senderId, s.recipientId].includes(group.participantId) &&
                  s.state === "pending" && (
                    <PrivateFollowup groupId={group.id} settlementId={s.id} />
                  )}
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    Immutable transition history
                  </summary>
                  <ul>
                    {s.events.map((e) => (
                      <li key={e.version}>
                        {e.version}. {e.fromState ?? "New"} → {e.toState} ·{" "}
                        {name(e.actorId)} · {e.confirmationType} · {e.createdAt}{" "}
                        · {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

export function RefundPanel({
  data,
  expenseId,
  revisionId,
  creatorId,
}: {
  data: GroupDetail;
  expenseId: string;
  revisionId: string;
  creatorId: string;
}) {
  const { group, ledger } = data;
  if (!ledger) return null;
  const rows = ledger.sources.filter((p) => p.expenseId === expenseId),
    name = (id: string) =>
      data.participants.find((p) => p.id === id)?.displayName ??
      "Historical participant";
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Shared refunds</h2>
      <p>
        Refunds preserve the original bill and settled payment history. Shared
        corrections do not change anyone’s private ledger automatically.
      </p>
      <ul>
        {ledger.refunds
          .filter((r) => r.expenseId === expenseId)
          .map((r) => (
            <li key={r.id}>
              {r.refundDate} · {money(r.totalMinor)} · {r.reason}
              <ul>
                {r.allocations.map((a) => (
                  <li key={a.axis + a.participantId}>
                    {name(a.participantId)} ·{" "}
                    {a.axis === "received" ? "Refund received" : "Share credit"}{" "}
                    · {money(a.amountMinor)}
                  </li>
                ))}
              </ul>
              {r.allocations.some(
                (a) => a.participantId === group.participantId,
              ) && (
                <Link
                  className="inline-flex min-h-11 items-center text-link underline"
                  href={`/sharing/${group.id}/effects/refund/${r.id}`}
                >
                  Review your private refund
                </Link>
              )}
            </li>
          ))}
      </ul>
      {group.active && !group.archived && group.participantId === creatorId && (
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Record shared refund allocations
          </summary>
          <CommandForm
            label="Record shared refund"
            build={(f) => ({
              kind: "refund",
              groupId: group.id,
              expectedVersion: group.version,
              clientCommandId: crypto.randomUUID(),
              expenseId,
              expectedRevisionId: revisionId,
              totalMinor: parsePhpAmountToMinorUnits(
                String(f.get("total")),
              ).toString(),
              refundDate: f.get("date"),
              reason: f.get("reason"),
              received: rows
                .filter((p) =>
                  String(f.get(`received:${p.participantId}`) ?? "").trim(),
                )
                .map((p) => ({
                  participantId: p.participantId,
                  amountMinor: parsePhpAmountToMinorUnits(
                    String(f.get(`received:${p.participantId}`)),
                  ).toString(),
                })),
              shareCredits: rows
                .filter((p) =>
                  String(f.get(`share_credit:${p.participantId}`) ?? "").trim(),
                )
                .map((p) => ({
                  participantId: p.participantId,
                  amountMinor: parsePhpAmountToMinorUnits(
                    String(f.get(`share_credit:${p.participantId}`)),
                  ).toString(),
                })),
            })}
          >
            <Field label="Refund total (PHP)">
              <Input name="total" inputMode="decimal" required />
            </Field>
            <Field label="Refund date">
              <Input name="date" type="date" required />
            </Field>
            <Field label="Refund reason">
              <Input name="reason" maxLength={2000} required />
            </Field>
            {rows.map((p) => (
              <fieldset
                key={p.participantId}
                className="grid gap-3 sm:grid-cols-2"
              >
                <legend>{name(p.participantId)}</legend>
                <Field
                  label={`Refund actually received (PHP), up to ${money((BigInt(p.paidMinor) - BigInt(p.refundReceivedMinor)).toString())}`}
                >
                  <Input
                    name={`received:${p.participantId}`}
                    inputMode="decimal"
                  />
                </Field>
                <Field
                  label={`Share credit (PHP), up to ${money((BigInt(p.shareMinor) - BigInt(p.refundShareMinor)).toString())}`}
                >
                  <Input
                    name={`share_credit:${p.participantId}`}
                    inputMode="decimal"
                  />
                </Field>
              </fieldset>
            ))}
            <p>
              Enter positive allocations only. Each axis must equal the total
              exactly. Record actual receipt separately in your own private
              finances after review.
            </p>
          </CommandForm>
        </details>
      )}
    </section>
  );
}
