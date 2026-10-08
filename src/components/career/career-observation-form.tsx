"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { careerObservationSchema } from "@/modules/career/domain/career-observation";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
const fields = careerObservationSchema.omit({
  clientCommandId: true,
  expectedApplicationVersion: true,
});
const subscribeHydration = () => () => {};
export function CareerObservationForm({
  applicationId,
  applicationVersion,
}: {
  applicationId: string;
  applicationVersion: number;
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const router = useRouter(),
    [pending, setPending] = useState(false),
    [retry, setRetry] = useState<z.input<
      typeof careerObservationSchema
    > | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof fields>, unknown, z.output<typeof fields>>({
    resolver: zodResolver(fields),
    defaultValues: { kind: "response", date: "", title: "", notes: "" },
  });
  async function save(body: z.input<typeof careerObservationSchema>) {
    setPending(true);
    setError(null);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/applications/${applicationId}/observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const p = await response.json().catch(() => null);
        if (response.status >= 500) {
          setRetry(body);
          setError("Save is unconfirmed. Retry this exact observation.");
        } else {
          setRetry(null);
          setError(
            p?.message ??
              "Observation was rejected. Review the fields or reload the application.",
          );
        }
        return;
      }
      setRetry(null);
      setMessage("Observation saved to application history.");
      reset();
      router.refresh();
    } catch {
      setRetry(body);
      setError("Save is unconfirmed. Retry this exact observation.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Panel
      title="Record a dated observation"
      description="Actual provider response, offer, no-response observation or note. This does not invent a stage change or reminder."
    >
      <form
        aria-label="Career observation"
        onSubmit={handleSubmit((v) =>
          save({
            ...v,
            clientCommandId: crypto.randomUUID(),
            expectedApplicationVersion: applicationVersion,
          }),
        )}
        className="space-y-4"
      >
        <fieldset
          disabled={!hydrated || pending || retry !== null}
          className="space-y-3"
        >
          <label className="block text-sm font-medium">
            Observation kind
            <select
              {...register("kind")}
              className="mt-2 min-h-11 w-full rounded-control border border-input bg-background px-3"
            >
              <option value="response">Provider response</option>
              <option value="offer">Provider offer</option>
              <option value="no_response">No-response observation</option>
              <option value="note">Dated note</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Actual observation date
            <Input
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
            />
            {errors.date && <span role="alert">{errors.date.message}</span>}
          </label>
          <label className="block text-sm font-medium">
            Observation title
            <Input {...register("title")} aria-invalid={!!errors.title} />
            {errors.title && <span role="alert">{errors.title.message}</span>}
          </label>
          <label className="block text-sm font-medium">
            Observation notes
            <textarea
              {...register("notes")}
              className="mt-2 min-h-24 w-full rounded-control border border-input bg-background p-3"
            />
          </label>
          <Button
            type="submit"
            loading={pending}
            loadingLabel="Saving observation…"
          >
            Save observation
          </Button>
        </fieldset>
        {retry && (
          <Button
            type="button"
            onClick={() => save(retry)}
            loading={pending}
            loadingLabel="Retrying observation…"
          >
            Retry same observation
          </Button>
        )}
        {error && <p role="alert">{error}</p>}
        <p role="status" aria-live="polite">
          {hydrated ? message : "Loading observation form…"}
        </p>
      </form>
    </Panel>
  );
}
