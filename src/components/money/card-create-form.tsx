"use client";
import { useState, useRef, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";

import { creditCardMetadataSchema } from "@/modules/finance/domain/credit-card";
import type { CreditCardReadModel } from "@/modules/finance/services/read-credit-cards";
import { parsePhpAmountToMinorUnits } from "@/shared/money";
import { exactDecimal } from "@/modules/reporting/domain/reports";
type Command = z.output<typeof creditCardMetadataSchema> & {
  clientCommandId: string;
  cardId?: string;
  expectedVersion?: number;
  archived?: boolean;
};
export function CardCreateForm({ card }: { card?: CreditCardReadModel } = {}) {
  const id = useId();
  const router = useRouter(),
    busy = useRef(false);
  const ready = useClientReady(),
    [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Command | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!pending) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    const navigation = (e: MouseEvent) => {
      if ((e.target as Element).closest("a[href]")) {
        e.preventDefault();
        setError("Retry the same save to resolve its outcome before leaving.");
      }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, [pending]);
  async function save(command: Command) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    setPending(command);
    const abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch("/api/v1/credit-cards", {
        method: card ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(command),
        cache: "no-store",
        signal: abort.signal,
      });
      if (response.ok) {
        const result = z
          .object({
            cardId: z.uuid(),
            version: z.number().int().positive(),
            financialRevision: z.string().regex(/^\d+$/),
          })
          .parse(await response.json());
        setPending(null);
        setSaved(true);
        router.push(`/money/cards/${result.cardId}`);
        router.refresh();
      } else if (response.status >= 500)
        setError(
          "The save outcome is unconfirmed. Retry the same save before creating another card.",
        );
      else {
        setPending(null);
        setError(
          response.status === 409
            ? "The card changed. Reload this page before saving updated details."
            : "Card details could not be saved. Review the recorded metadata and try again.",
        );
      }
    } catch {
      setError(
        "The save outcome is unconfirmed. Keep this page open and retry the same save.",
      );
    } finally {
      clearTimeout(timeout);
      setSaving(false);
      busy.current = false;
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || busy.current) return;
        const data = new FormData(e.currentTarget);
        const name = String(data.get("name") ?? "").trim(),
          issuerName = String(data.get("issuerName") ?? "").trim();
        if (
          !name ||
          !issuerName ||
          name.length > 200 ||
          issuerName.length > 200
        ) {
          setError("Enter a card name and issuer, each up to 200 characters.");
          return;
        }
        try {
          const limit = String(data.get("creditLimit") ?? "").trim();
          const metadata = creditCardMetadataSchema.parse({
            name,
            issuerName,
            creditLimitMinor: limit
              ? parsePhpAmountToMinorUnits(limit).toString()
              : null,
            limitVerifiedDate:
              String(data.get("limitVerifiedDate") ?? "") || null,
            notes: String(data.get("notes") ?? "") || null,
          });
          void save({
            ...metadata,
            clientCommandId: crypto.randomUUID(),
            ...(card
              ? {
                  cardId: card.cardId,
                  expectedVersion: card.version,
                  archived: data.get("archived") === "on",
                }
              : {}),
          });
        } catch {
          setError(
            "Enter an exact nonnegative credit limit with at most two decimal places and supported provider metadata.",
          );
        }
      }}
    >
      <fieldset
        disabled={!ready || saving || pending !== null || saved}
        className="space-y-4"
      >
        <FormField htmlFor={id + "-name"} label="Card name">
          <Input
            id={id + "-name"}
            defaultValue={card?.name}
            name="name"
            required
            maxLength={200}
            placeholder="BPI Visa"
          />
        </FormField>
        <FormField htmlFor={id + "-issuer"} label="Issuer">
          <Input
            id={id + "-issuer"}
            defaultValue={card?.issuerName}
            name="issuerName"
            required
            maxLength={200}
            placeholder="BPI"
          />
        </FormField>
        <details open={!!card}>
          <summary className="min-h-11 cursor-pointer">
            Provider limit and card metadata
          </summary>
          <div className="space-y-4">
            <FormField
              htmlFor={id + "-limit"}
              label="Recorded credit limit (PHP)"
            >
              <Input
                id={id + "-limit"}
                name="creditLimit"
                inputMode="decimal"
                maxLength={23}
                defaultValue={
                  card?.creditLimitMinor !== null &&
                  card?.creditLimitMinor !== undefined
                    ? exactDecimal(card.creditLimitMinor)
                    : ""
                }
              />
            </FormField>
            <FormField
              htmlFor={id + "-verified"}
              label="Limit verification date"
            >
              <Input
                id={id + "-verified"}
                name="limitVerifiedDate"
                type="date"
                defaultValue={card?.limitVerifiedDate ?? ""}
              />
            </FormField>
            <FormField htmlFor={id + "-notes"} label="Card notes">
              <textarea
                id={id + "-notes"}
                name="notes"
                maxLength={20000}
                defaultValue={card?.notes ?? ""}
                className="min-h-22 w-full rounded-control border border-input bg-surface p-3 text-base"
              />
            </FormField>
            <p className="text-sm text-muted-foreground">
              Optional provider evidence. An amount without a supported
              verification date remains unverified. Leave unknown values blank.
              A limit never posts money or becomes cash.
            </p>
            {card && (
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="archived"
                  defaultChecked={card.archived}
                />
                Archive card (keeps recorded history)
              </label>
            )}
          </div>
        </details>
        <p className="text-sm text-muted-foreground">
          Add a card, then record its posted purchases through Add Expense.
          {card
            ? "Metadata changes preserve posted balances and immutable financial history."
            : "Creating a card starts with no recorded outstanding."}
        </p>
        <Button type="submit">
          {saving ? "Saving…" : card ? "Save card metadata" : "Add credit card"}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {pending && !saving && (
        <Button type="button" onClick={() => void save(pending)}>
          Retry same save
        </Button>
      )}
    </form>
  );
}
