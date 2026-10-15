"use client";
import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const selectClass =
  "min-h-11 w-full min-w-0 rounded-button border border-input bg-background px-3 py-2 text-foreground";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function useSharingCommand(onSuccess?: (result: unknown) => void) {
  const router = useRouter(),
    pending = useRef<{ url: string; body: unknown } | null>(null),
    running = useRef(false);
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("");
  async function send(url: string, body: unknown) {
    if (running.current) return;
    running.current = true;
    pending.current ??= { url, body };
    setBusy(true);
    setMessage("Saving…");
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const p = pending.current,
        response = await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p.body),
          signal: controller.signal,
        }),
        result = await response.json();
      if (!response.ok) {
        if (result.retryable || response.status >= 500) {
          setUncertain(true);
          setMessage("Save is unconfirmed. Retry the same command.");
        } else {
          pending.current = null;
          setUncertain(false);
          setMessage(result.message ?? "Review the request and try again.");
        }
        return;
      }
      pending.current = null;
      setUncertain(false);
      setMessage("Saved.");
      onSuccess?.(result);
      router.refresh();
    } catch {
      setUncertain(true);
      setMessage("Save is unconfirmed. Retry the same command.");
    } finally {
      clearTimeout(timeout);
      running.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    uncertain,
    message,
    locked: busy || uncertain,
    send,
    retry: () =>
      pending.current && send(pending.current.url, pending.current.body),
  };
}
export function CommandForm({
  build,
  children,
  label = "Save",
  url = "/api/v1/sharing",
  onSuccess,
}: {
  build: (form: FormData) => unknown;
  children: ReactNode;
  label?: string;
  url?: string;
  onSuccess?: (result: unknown) => void;
}) {
  const command = useSharingCommand(onSuccess),
    [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setError("");
      const body = build(new FormData(e.currentTarget));
      void command.send(url, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review the form.");
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={command.locked} className="grid min-w-0 gap-4">
        {children}
        <Button type="submit">{label}</Button>
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
export function CreateGroupForm({
  onCreated,
}: { onCreated?: (groupId: string) => void } = {}) {
  const router = useRouter();
  return (
    <CommandForm
      label="Create group"
      onSuccess={(r) => {
        const groupId = (r as { groupId: string }).groupId;
        if (onCreated) onCreated(groupId);
        else router.push(`/sharing/${groupId}`);
      }}
      build={(f) => ({
        kind: "create",
        clientCommandId: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        name: f.get("name"),
        displayName: f.get("displayName"),
      })}
    >
      <Field label="Group name">
        <Input name="name" required maxLength={200} />
      </Field>
      <Field label="Your name in this group">
        <Input name="displayName" required maxLength={200} />
      </Field>
    </CommandForm>
  );
}
