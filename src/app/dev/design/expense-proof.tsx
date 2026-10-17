"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  CommandStatus,
  ReviewSummary,
  type CommandState,
} from "@/components/patterns/review";
import { ScreenHeader, WorkArea } from "@/components/patterns/work-area";
import { money, reviewRows } from "./fixtures";
import styles from "./proofs.module.css";

const messages: Record<CommandState, string> = {
  draft:
    "Your entry stays in memory while you review. Nothing has been recorded.",
  review:
    "Check the account, date, allocation and exact effects before confirming.",
  submitting:
    "The submitted summary stays visible. Duplicate confirmation is disabled.",
  confirmed:
    "Synthetic accepted receipt. No transaction was sent or persisted.",
  "validation-failure":
    "The draft is still here. Enter a description to continue.",
  "stale-revision":
    "Reload authoritative context and review again. Keep your input for comparison.",
  "unknown-outcome":
    "Keep the original command and payload. Check its status before a safe retry; do not create a second transaction.",
  "partial-completion":
    "Use the workflow's confirmed counts and supported resume action.",
};

/** A presentation fixture, never a financial command or new expense route. */
export function ExpenseProof({
  initialStage,
}: {
  initialStage: "draft" | "review";
}) {
  const [state, setState] = useState<CommandState>(initialStage);
  const [description, setDescription] = useState("Weekly groceries");
  const [notes, setNotes] = useState("");
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const descriptionInput = useRef<HTMLInputElement>(null);
  const previousState = useRef(state);
  const editing = state === "draft" || state === "validation-failure";
  useEffect(() => {
    // Focus only real task-state changes. Strict Mode's initial effect replay
    // must not scroll a newly opened task or interrupt its Back link.
    if (previousState.current === state) return;
    previousState.current = state;
    if (body.current) body.current.scrollTop = 0;
    if (state === "validation-failure") descriptionInput.current?.focus();
    else {
      header.current?.focus();
      header.current?.scrollIntoView({ block: "start" });
    }
  }, [state]);
  const rows = [
    ...reviewRows.map((row) =>
      row.key === "description" ? { ...row, value: description } : row,
    ),
    { key: "category", label: "Groceries allocation", value: money("124530") },
    { key: "remaining", label: "Remaining to allocate", value: money("0") },
    { key: "notes", label: "Notes", value: notes || "None" },
  ];
  return (
    <WorkArea
      variant="editor"
      className={`${styles.taskWorkArea} max-w-[850px]`}
    >
      <a
        href="/dev/design?screen=activity"
        className="inline-flex min-h-12 items-center gap-2 rounded-control px-2 text-sm font-medium text-link hover:bg-accent"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to activity
      </a>
      <div ref={header} tabIndex={-1} className="focus:outline-none">
        <ScreenHeader
          title={
            editing
              ? "Add expense"
              : state === "confirmed"
                ? "Expense confirmation"
                : "Review expense"
          }
          scope={`Money · ${editing ? "1 · Entry" : state === "confirmed" ? "3 · Result" : "2 · Review"} · Synthetic task`}
          marker={
            <span className="rounded-panel bg-accent p-3 text-accent-foreground">
              <ReceiptText aria-hidden="true" className="size-5" />
            </span>
          }
        />
      </div>
      <CommandStatus state={state}>{messages[state]}</CommandStatus>
      <div
        ref={body}
        className={styles.taskBody}
        data-testid="expense-task-body"
      >
        {editing ? (
          <form
            id="expense-entry"
            className="grid gap-4 rounded-dialog border border-border bg-surface p-4 sm:grid-cols-2 sm:p-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setState(description.trim() ? "review" : "validation-failure");
              if (!description.trim()) descriptionInput.current?.focus();
            }}
          >
            <FormField
              label="Amount (fixture)"
              htmlFor="expense-amount"
              description="Fixed synthetic amount; no financial command is sent."
            >
              <Input
                id="expense-amount"
                value="1245.30"
                readOnly
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Effective date" htmlFor="expense-date">
              <Input id="expense-date" value="2026-10-17" readOnly />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                label="Description"
                htmlFor="expense-description"
                required
                error={
                  state === "validation-failure"
                    ? "Enter a description."
                    : undefined
                }
              >
                <Input
                  ref={descriptionInput}
                  id="expense-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Paying account" htmlFor="expense-account">
              <Select id="expense-account">
                <option>Everyday wallet</option>
              </Select>
            </FormField>
            <FormField label="Category" htmlFor="expense-category">
              <Select id="expense-category">
                <option>Groceries</option>
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Notes" htmlFor="expense-notes">
                <Textarea
                  id="expense-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-20"
                  placeholder="Optional context"
                />
              </FormField>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-dialog bg-accent p-5 text-accent-foreground">
              <div>
                <p className="text-sm">Expense · {description}</p>
                <p className="numeric-value mt-1 text-focal font-bold">
                  {money("124530")}
                </p>
              </div>
              <Wallet aria-hidden="true" className="size-7" />
            </div>
            <ReviewSummary
              title={
                state === "confirmed"
                  ? "Confirmed fixture effects"
                  : "Exact effects"
              }
              rows={rows}
            >
              <p className="text-sm text-muted-foreground">
                Category portions do not deduct cash again. This cash expense
                creates no liability.
              </p>
            </ReviewSummary>
          </div>
        )}
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-12 cursor-pointer content-center">
            Fixture response controls
          </summary>
          <div className="mt-3 max-w-sm">
            <FormField
              label="Inspect response presentation"
              htmlFor="command-state"
            >
              <Select
                id="command-state"
                value={state}
                onChange={(event) =>
                  setState(event.target.value as CommandState)
                }
              >
                {Object.keys(messages).map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </details>
      </div>
      <div className={styles.taskActions} aria-label="Expense task actions">
        {editing ? (
          <>
            <span className="text-sm text-muted-foreground">
              Next: exact effects
            </span>
            <Button type="submit" form="expense-entry">
              Review expense
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={
                state === "submitting" ||
                state === "unknown-outcome" ||
                state === "confirmed"
              }
              onClick={() => setState("draft")}
            >
              Edit entry
            </Button>
            {state === "review" ? (
              <ConfirmationDialog
                trigger={<Button>Confirm expense (fixture)</Button>}
                title="Record this expense?"
                description="Confirm these exact effects. The fixture waits for an explicit accepted response."
                action={
                  <Button onClick={() => setState("submitting")}>
                    Record expense (fixture)
                  </Button>
                }
              >
                <p className="numeric-value mt-4 font-semibold">
                  {money("124530")} from Everyday wallet
                </p>
              </ConfirmationDialog>
            ) : state === "submitting" ? (
              <>
                <Button loading loadingLabel="Recording expense…">
                  Record expense (fixture)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setState("confirmed")}
                >
                  Receive accepted fixture
                </Button>
              </>
            ) : state === "confirmed" ? (
              <a
                href="/dev/design?screen=activity&record=groceries"
                className="inline-flex min-h-12 items-center gap-2 rounded-button bg-accent px-4 text-sm font-medium text-accent-foreground"
              >
                View fixture record
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            ) : null}
          </>
        )}
      </div>
    </WorkArea>
  );
}
