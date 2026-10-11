"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useClientReady } from "@/shared/use-client-ready";

type Command = { clientCommandId: string; name: string; issuerName: string };
export function CardCreateForm() {
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
        method: "POST",
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
          "Card details could not be saved. Review the name and issuer and try again.",
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
        void save({ clientCommandId: crypto.randomUUID(), name, issuerName });
      }}
    >
      <fieldset
        disabled={!ready || saving || pending !== null || saved}
        className="space-y-4"
      >
        <FormField htmlFor="card-name" label="Card name">
          <Input
            id="card-name"
            name="name"
            required
            maxLength={200}
            placeholder="BPI Visa"
          />
        </FormField>
        <FormField htmlFor="card-issuer" label="Issuer">
          <Input
            id="card-issuer"
            name="issuerName"
            required
            maxLength={200}
            placeholder="BPI"
          />
        </FormField>
        <p className="text-sm text-muted-foreground">
          Add a card, then record its posted purchases through Add Expense.
          Creating a card starts with no recorded outstanding.
        </p>
        <Button type="submit">{saving ? "Saving…" : "Add credit card"}</Button>
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
