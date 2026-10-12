"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
type Pending = {
  path: string;
  body: Record<string, unknown>;
  summary: string[];
};
export function useCardEvidenceCommand(
  destination: string,
  successField:
    "actionId" | "allocationId" | "planId" | "applicationId" = "actionId",
) {
  const router = useRouter(),
    [pending, setPending] = useState<Pending | null>(null),
    [phase, setPhase] = useState<"review" | "saving" | "uncertain">("review"),
    [error, setError] = useState<string | null>(null),
    busy = useRef(false),
    uncertain = useRef(false);
  useEffect(() => {
    if (!pending) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const nav = (e: MouseEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("a[href]") &&
        !window.confirm(
          "Leave this page with an unconfirmed command? Keep it open to finish or retry the identical command.",
        )
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", nav, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", nav, true);
    };
  }, [pending]);
  async function send() {
    if (!pending || busy.current) return;
    busy.current = true;
    setPhase("saving");
    setError(null);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(pending.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pending.body),
        signal: controller.signal,
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const p = z
          .object({
            message: z.string().optional(),
            retryable: z.boolean().optional(),
          })
          .passthrough()
          .safeParse(value);
        if (
          p.success &&
          p.data.retryable === false &&
          !uncertain.current &&
          ![401, 403, 429].includes(response.status)
        ) {
          setPending(null);
          setPhase("review");
          setError(p.data.message ?? "Review the evidence and try again.");
          return;
        }
        throw Error("Unconfirmed outcome");
      }
      const result = z
        .object({
          financialRevision: z.string().regex(/^\d+$/),
        })
        .passthrough()
        .parse(value);
      z.uuid().parse(result[successField]);
      setPending(null);
      router.push(destination);
      router.refresh();
    } catch {
      uncertain.current = true;
      setPhase("uncertain");
      setError(
        "The outcome could not be confirmed. Retry the identical command; keep this page open.",
      );
    } finally {
      clearTimeout(timer);
      busy.current = false;
    }
  }
  function prepare(p: Pending) {
    uncertain.current = false;
    setError(null);
    setPhase("review");
    setPending(p);
  }
  return {
    pending,
    phase,
    error,
    setError,
    prepare,
    send,
    edit: () => {
      if (phase === "review") setPending(null);
    },
  };
}
export function CardEvidenceCommandReview({
  command,
}: {
  command: ReturnType<typeof useCardEvidenceCommand>;
}) {
  const review = useRef<HTMLHeadingElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (command.pending) review.current?.focus();
  }, [command.pending]);
  useEffect(() => {
    if (command.error) errorRef.current?.focus();
  }, [command.error]);
  return (
    <>
      {command.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-danger">
          {command.error}
        </p>
      )}
      {command.pending && (
        <section
          className="space-y-3 rounded-md border border-border p-4"
          aria-label="Review card command"
        >
          <h2 ref={review} tabIndex={-1} className="text-xl font-semibold">
            Review card command
          </h2>
          <ul>
            {command.pending.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p>
            Preserve this confirmed evidence. Corrections retain history and
            require new allocation confirmation for superseded revisions.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={command.phase === "saving"}
              onClick={() => void command.send()}
            >
              {command.phase === "uncertain"
                ? "Retry identical command"
                : command.phase === "saving"
                  ? "Recording…"
                  : "Confirm and record"}
            </Button>
            {command.phase === "review" && (
              <Button type="button" variant="secondary" onClick={command.edit}>
                Back to edit
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
