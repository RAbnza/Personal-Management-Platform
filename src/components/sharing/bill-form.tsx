"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { allocateBill, billSchema } from "@/modules/sharing/domain/sharing";
import type {
  GroupDetail,
  BillRevision,
  GroupSummary,
} from "@/modules/sharing/services/read-groups";
import type { PrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { exactDecimal } from "@/modules/reporting/domain/reports";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreateGroupForm,
  Field,
  selectClass,
  useSharingCommand,
} from "./forms";
type ExpenseDefaults = {
  amount?: string;
  description?: string;
  date?: string;
  funding?: string;
  categoryId?: string;
  postingDate?: string;
  providerReference?: string;
};
export const money = (value: string) => formatMoneyMinorUnits("PHP", value);
export function FundingFields({
  setup,
  paid = true,
  defaults,
  showFunding = true,
}: {
  setup: PrivateSharingSetup;
  paid?: boolean;
  defaults?: ExpenseDefaults;
  showFunding?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showFunding &&
        (paid ? (
          <>
            <Field label="Private funding or existing purchase">
              <select
                name="funding"
                className={selectClass}
                required
                defaultValue={defaults?.funding}
              >
                <optgroup label="New cash funding">
                  {setup.accounts.map((a) => (
                    <option key={a.id} value={`cash:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="New card purchase">
                  {setup.cards.map((a) => (
                    <option key={a.id} value={`card:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Link an existing purchase">
                  {setup.purchases.map((a) => (
                    <option key={a.id} value={`existing:${a.id}`}>
                      {a.date} · {a.description} · {money(a.amountMinor)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Provider posting date (new card funding)">
              <Input
                name="postingDate"
                type="date"
                defaultValue={defaults?.postingDate}
              />
            </Field>
            <Field label="Provider reference (optional)">
              <Input
                name="providerReference"
                maxLength={2000}
                defaultValue={defaults?.providerReference}
              />
            </Field>
          </>
        ) : (
          <p>
            No cash or card funding: you are adopting your own unpaid share.
          </p>
        ))}
      <Field label="Your private spending category">
        <select
          name="categoryId"
          className={selectClass}
          defaultValue={defaults?.categoryId}
        >
          <option value="">Uncategorized</option>
          {setup.categories.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex min-h-11 items-center gap-3">
        <input name="negative" type="checkbox" />I acknowledge any resulting
        negative cash balance.
      </label>
    </div>
  );
}
export function fundingInput(
  form: FormData,
  setup: PrivateSharingSetup,
  paid: boolean,
) {
  if (!paid) return { kind: "none" };
  const [kind, key] = String(form.get("funding") ?? "").split(":");
  if (kind === "cash") return { kind, accountId: key };
  if (kind === "card")
    return {
      kind,
      cardId: key,
      postingDate: form.get("postingDate"),
      providerReference: form.get("providerReference") || null,
    };
  const existing = setup.purchases.find((p) => p.id === key);
  if (kind === "existing" && existing)
    return {
      kind,
      actionId: key,
      expectedActionRevisionId: existing.revisionId,
    };
  throw new RangeError("Select your private funding or an existing purchase.");
}
export function SharedBillForm({
  data,
  setup,
  initial,
  defaults,
  adoptInitially = false,
}: {
  data: GroupDetail;
  setup: PrivateSharingSetup;
  initial?: BillRevision;
  defaults?: ExpenseDefaults;
  adoptInitially?: boolean;
}) {
  const router = useRouter(),
    people = data.participants.filter(
      (p) =>
        p.active ||
        p.identityKind === "manual" ||
        initial?.shares.some((s) => s.participantId === p.id) ||
        initial?.contributions.some((s) => s.participantId === p.id),
    );
  const [total, setTotal] = useState(
      initial ? exactDecimal(initial.totalMinor) : (defaults?.amount ?? ""),
    ),
    [method, setMethod] = useState<"equal" | "exact">(
      (initial?.splitMethod as "equal" | "exact") ?? "equal",
    );
  const [payers, setPayers] = useState<Record<string, string>>(() =>
    initial
      ? Object.fromEntries(
          initial.contributions.map((p) => [
            p.participantId,
            exactDecimal(p.amountMinor),
          ]),
        )
      : {},
  );
  const [multiple, setMultiple] = useState(
      (initial?.contributions.length ?? 0) > 1,
    ),
    [single, setSingle] = useState(
      initial?.contributions[0]?.participantId ?? data.group.participantId,
    );
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      people.map((p) => [
        p.id,
        initial ? initial.shares.some((s) => s.participantId === p.id) : true,
      ]),
    ),
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial?.shares.map((p) => [
        p.participantId,
        exactDecimal(p.amountMinor),
      ]) ?? [],
    ),
  );
  const [adopt, setAdopt] = useState(adoptInitially),
    [error, setError] = useState("");
  const command = useSharingCommand((result) => {
    const r = result as { subjectId?: string; group?: { subjectId: string } };
    router.push(
      `/sharing/${data.group.id}/expenses/${r.subjectId ?? r.group?.subjectId}`,
    );
  });
  function allocation(): ReturnType<typeof allocateBill> {
    const amount = parsePhpAmountToMinorUnits(total).toString();
    return allocateBill({
      description: "Preview",
      expenseDate: "2026-01-01",
      totalMinor: amount,
      splitMethod: method,
      contributions: multiple
        ? people
            .filter(
              (p) =>
                payers[p.id] && parsePhpAmountToMinorUnits(payers[p.id]!) > 0n,
            )
            .map((p) => ({
              participantId: p.id,
              amountMinor: parsePhpAmountToMinorUnits(payers[p.id]!).toString(),
            }))
        : [{ participantId: single, amountMinor: amount }],
      shares: people
        .filter((p) => selected[p.id])
        .map((p) => ({
          participantId: p.id,
          ...(method === "exact"
            ? {
                amountMinor: parsePhpAmountToMinorUnits(
                  shares[p.id] ?? "",
                ).toString(),
              }
            : {}),
        })),
      categoryLabel: null,
      notes: null,
    });
  }
  let preview: ReturnType<typeof allocation> | null = null,
    previewError = "Enter the bill amount and allocations to preview.";
  try {
    preview = allocation();
  } catch (e) {
    if (total) previewError = e instanceof Error ? e.message : previewError;
  }
  const paid =
    preview?.contributions.find(
      (p) => p.participantId === data.group.participantId,
    )?.amountMinor ?? "0";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setError("");
      const f = new FormData(e.currentTarget),
        a = allocation();
      const bill = billSchema.parse({
        description: String(f.get("description")),
        expenseDate: String(f.get("date")),
        totalMinor: a.totalMinor,
        splitMethod: a.splitMethod,
        contributions: a.contributions,
        shares: a.shares.map((s) => ({
          participantId: s.participantId,
          amountMinor: s.amountMinor,
        })),
        categoryLabel: String(f.get("categoryLabel") || "") || null,
        notes: String(f.get("notes") || "") || null,
      });
      const groupCommand = {
        kind: "bill",
        clientCommandId: crypto.randomUUID(),
        groupId: data.group.id,
        expectedVersion: data.group.version,
        bill,
        expenseId: initial?.id ?? null,
        expectedRevisionId: initial?.revisionId ?? null,
        reason: f.get("reason") || null,
      };
      const body = adopt
        ? {
            groupCommand,
            adoption: {
              clientCommandId: crypto.randomUUID(),
              groupId: data.group.id,
              expectedFinancialRevision: setup.financialRevision,
              approved: true,
              funding: fundingInput(f, setup, BigInt(paid) > 0n),
              categoryId: f.get("categoryId") || null,
              acknowledgeNegativeBalance: f.get("negative") === "on",
            },
          }
        : groupCommand;
      await command.send(
        adopt ? "/api/v1/sharing/adoption" : "/api/v1/sharing",
        body,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review the bill.");
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={command.locked} className="min-w-0 space-y-5">
        <legend className="text-xl font-semibold">
          {initial ? "Review a new bill revision" : "Add shared expense"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description">
            <Input
              name="description"
              required
              maxLength={2000}
              defaultValue={initial?.description ?? defaults?.description}
            />
          </Field>
          <Field label="Expense date">
            <Input
              name="date"
              required
              type="date"
              defaultValue={initial?.expenseDate ?? defaults?.date}
            />
          </Field>
          <Field label="Total bill (PHP)">
            <Input
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </Field>
          <Field label="Group category or label (optional)">
            <Input
              name="categoryLabel"
              maxLength={200}
              defaultValue={initial?.categoryLabel ?? ""}
            />
          </Field>
        </div>
        <fieldset className="space-y-3">
          <legend className="font-semibold">Who paid?</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
            />
            Multiple payers
          </label>
          {multiple ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {people.map((p) => (
                <Field key={p.id} label={`${p.displayName} paid (PHP)`}>
                  <Input
                    inputMode="decimal"
                    value={payers[p.id] ?? ""}
                    onChange={(e) =>
                      setPayers({ ...payers, [p.id]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
          ) : (
            <div
              role="group"
              aria-label="Payer"
              className="flex flex-wrap gap-2"
            >
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={single === p.id}
                  onClick={() => setSingle(p.id)}
                  className={`min-h-11 rounded-control border px-4 py-3 text-sm font-semibold ${single === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="font-semibold">Split method</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["equal", "Split equally"],
                ["exact", "Set exact amounts"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border p-3 ${method === value ? "border-primary bg-[var(--teal-surface)]" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="split-method"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="font-semibold">Who participated?</legend>
          {people.map((p) => (
            <div
              key={p.id}
              className={`space-y-2 rounded-card border p-4 ${selected[p.id] ? "border-primary bg-[var(--teal-surface)]" : "border-border bg-surface"}`}
            >
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected[p.id] ?? false}
                  onChange={(e) =>
                    setSelected({ ...selected, [p.id]: e.target.checked })
                  }
                />
                {p.displayName}
              </label>
              {selected[p.id] && preview && (
                <p className="text-xl font-semibold tabular-nums">
                  {money(
                    preview.shares.find((s) => s.participantId === p.id)
                      ?.amountMinor ?? "0",
                  )}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {preview.shares.find((s) => s.participantId === p.id)
                      ?.roundingExtraMinor
                      ? "Includes one rounding centavo"
                      : "Allocated share"}
                  </span>
                </p>
              )}
              {method === "exact" && selected[p.id] && (
                <Field label={`${p.displayName} share (PHP)`}>
                  <Input
                    inputMode="decimal"
                    value={shares[p.id] ?? ""}
                    onChange={(e) =>
                      setShares({ ...shares, [p.id]: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
          ))}
        </fieldset>
        <section
          aria-label="Bill preview"
          className="rounded-card bg-surface-subtle p-5"
        >
          <h3 className="font-semibold">Review exact allocations</h3>
          {preview ? (
            <>
              <p>
                Total paid {money(preview.totalMinor)} · Total shares{" "}
                {money(preview.totalMinor)}
              </p>
              <ul>
                {people.map((p) => {
                  const share = preview!.shares.find(
                      (s) => s.participantId === p.id,
                    ),
                    paid = preview!.contributions.find(
                      (s) => s.participantId === p.id,
                    );
                  return (
                    <li key={p.id}>
                      {p.displayName}: paid {money(paid?.amountMinor ?? "0")} ·
                      share {money(share?.amountMinor ?? "0")} · net{" "}
                      {money(
                        (
                          BigInt(paid?.amountMinor ?? "0") -
                          BigInt(share?.amountMinor ?? "0")
                        ).toString(),
                      )}
                      {share?.roundingExtraMinor === 1
                        ? " · receives extra centavo"
                        : ""}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>{previewError}</p>
          )}
        </section>
        <details>
          <summary className="action-link">Add shared notes</summary>
          <Field label="Shared notes (optional)">
            <textarea
              name="notes"
              className={selectClass}
              maxLength={20000}
              defaultValue={initial?.notes ?? ""}
            />
          </Field>
        </details>
        {initial ? (
          <Field label="Reason for reviewed revision">
            <Input name="reason" required maxLength={2000} />
          </Field>
        ) : (
          <>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={adopt}
                onChange={(e) => setAdopt(e.target.checked)}
              />
              Also record my allocation privately
            </label>
            {adopt && (
              <>
                <p>
                  Only your workspace changes. Your funding is {money(paid)};
                  your spending is your share. Other participants approve their
                  own private adoption.
                </p>
                <FundingFields
                  setup={setup}
                  paid={BigInt(paid) > 0n}
                  {...(defaults ? { defaults } : {})}
                />
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" required />I approve this private
                  accounting and the actual funding shown.
                </label>
              </>
            )}
          </>
        )}
        <Button type="submit" disabled={!preview}>
          Save reviewed expense
        </Button>
      </fieldset>
      {command.uncertain && (
        <Button
          type="button"
          onClick={() => void command.retry()}
          disabled={command.busy}
        >
          Retry same command
        </Button>
      )}
      <p role="status" aria-live="polite">
        {error || command.message}
      </p>
    </form>
  );
}
export function SharedExpenseEntry({
  groups,
  setup,
  defaults,
  onCancel,
}: {
  groups: GroupSummary[];
  setup: PrivateSharingSetup;
  defaults?: ExpenseDefaults;
  onCancel?: () => void;
}) {
  const [choices, setChoices] = useState(groups),
    [groupId, setGroupId] = useState(""),
    [data, setData] = useState<GroupDetail | null>(null),
    [error, setError] = useState(""),
    requestNumber = useRef(0);
  async function select(value: string) {
    const request = ++requestNumber.current;
    setGroupId(value);
    setData((current) => (current?.group.id === value ? current : null));
    setError("");
    if (!value) return;
    try {
      const r = await fetch(`/api/v1/sharing?groupId=${value}`);
      if (!r.ok) throw new Error();
      const result = (await r.json()) as GroupDetail;
      if (request === requestNumber.current) {
        setData(result);
        setChoices((current) =>
          current.some((g) => g.id === result.group.id)
            ? current
            : [...current, result.group],
        );
      }
    } catch {
      if (request === requestNumber.current)
        setError("The group could not be loaded. Select it again to retry.");
    }
  }
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Split with people</h2>
      <p>
        One bill, with optional private adoption.{" "}
        <Link className="text-link underline" href="/sharing">
          Create or manage groups
        </Link>
        .
      </p>
      {onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back to personal expense
        </Button>
      )}
      <Field label="Shared expense group">
        <select
          className={selectClass}
          value={groupId}
          onChange={(e) => void select(e.target.value)}
        >
          <option value="">Select a group</option>
          {choices
            .filter((g) => g.active && !g.archived)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </Field>
      <details>
        <summary className="min-h-11 cursor-pointer">
          Create a new group here
        </summary>
        <CreateGroupForm onCreated={(value) => void select(value)} />
      </details>
      {data && (
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/sharing/${data.group.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Manage participants in another tab
          </Link>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void select(groupId)}
          >
            Refresh participants
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <SharedBillForm
          key={data.group.id}
          data={data}
          setup={setup}
          adoptInitially
          {...(defaults ? { defaults } : {})}
        />
      )}
    </section>
  );
}
