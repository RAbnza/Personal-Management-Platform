"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/cn";
import {
  ArrowDownLeft,
  House,
  Wallet,
  ListChecks,
  ReceiptText,
  ChevronRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  SheetContent,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Popover } from "@/components/ui/popover";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Disclosure } from "@/components/ui/disclosure";
import {
  EmptyState,
  InlineError,
  LoadingRegion,
  StatusBadge,
} from "@/components/ui/feedback";
import {
  WorkArea,
  ScreenHeader,
  DetailLayout,
} from "@/components/patterns/work-area";
import {
  CompactRecordList,
  RecordTable,
  type RecordColumn,
} from "@/components/patterns/records";
import {
  FilterBar,
  PageControls,
  cursorPage,
} from "@/components/patterns/list-controls";
import { Metric, CoverageNotice } from "@/components/patterns/metric";
import { ReviewSummary, CommandStatus } from "@/components/patterns/review";
import { activity, money, type ActivityRecord } from "./fixtures";
import { ExpenseProof } from "./expense-proof";
import { ProductNavigation } from "./product-navigation";
import styles from "./proofs.module.css";

const proofUrl = (screen: string, record?: string) =>
  `/dev/design?screen=${screen}${record ? `&record=${record}` : ""}`;
const link =
  "inline-flex min-h-12 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline";
const subscribeHydration = () => () => {};
function ProofLink({
  screen,
  children,
}: {
  screen: string;
  children: ReactNode;
}) {
  return (
    <a href={proofUrl(screen)} className={link}>
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </a>
  );
}

function subscribeWide(callback: () => void) {
  const mq = window.matchMedia("(min-width: 1280px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false,
  );
}

export function DesignProofs({
  screen,
  record,
  treatment = "ivory",
  stage = "draft",
}: {
  screen: string;
  record?: string;
  treatment?: "ivory" | "cream";
  stage?: "draft" | "review";
}) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [lightTreatment, setLightTreatment] = useState(treatment);
  return (
    <div
      className={cn("design-proof", styles.proof)}
      data-light-treatment={lightTreatment}
      data-task={screen === "expense"}
      data-review-ready={hydrated}
    >
      <a
        href="#proof-content"
        className="sr-only fixed top-4 left-4 z-(--z-notice) rounded-button bg-primary p-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to design proof
      </a>
      <details className={styles.reviewTools} data-testid="review-tools">
        <summary>M1 review controls - synthetic previews</summary>
        <div className={styles.reviewFields}>
          <FormField label="Design proof" htmlFor="proof-screen">
            <Select
              id="proof-screen"
              value={screen}
              onChange={(event) =>
                window.location.assign(proofUrl(event.target.value))
              }
            >
              <option value="home">Home</option>
              <option value="activity">Financial activity</option>
              <option value="expense">Expense entry</option>
              <option value="migration">Tracker migration</option>
              <option value="states">Interaction states</option>
              <option value="calendar">Calendar navigation sample</option>
            </Select>
          </FormField>
          <FormField label="Theme" htmlFor="proof-theme">
            <Select
              id="proof-theme"
              value={theme ?? "system"}
              onChange={(event) => setTheme(event.target.value)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </FormField>
          <FormField
            label="Light background (review only)"
            htmlFor="proof-treatment"
          >
            <Select
              id="proof-treatment"
              value={lightTreatment}
              onChange={(event) =>
                setLightTreatment(event.target.value as "ivory" | "cream")
              }
            >
              <option value="ivory">Bright ivory - recommended</option>
              <option value="cream">Soft cream - alternative</option>
            </Select>
          </FormField>
        </div>
        <p>
          No new workspace preference. The alternatives affect light previews
          only.
        </p>
      </details>
      <ProductNavigation screen={screen} />
      <main id="proof-content" tabIndex={-1}>
        {screen === "activity" ? (
          <ActivityProof {...(record ? { record } : {})} />
        ) : screen === "expense" ? (
          <ExpenseProof initialStage={stage} />
        ) : screen === "migration" ? (
          <MigrationProof />
        ) : screen === "states" ? (
          <StateProof />
        ) : screen === "calendar" ? (
          <CalendarProof />
        ) : (
          <HomeProof />
        )}
      </main>
      <footer className="mx-auto max-w-(--layout-content-max) px-4 py-6 text-xs text-muted-foreground sm:px-6">
        Development proof - synthetic data only - revised M1 awaiting owner
        visual approval
      </footer>
    </div>
  );
}

function CalendarProof() {
  return (
    <WorkArea>
      <ScreenHeader
        title="Today, at a glance"
        scope="Calendar - navigation prototype"
        marker={<ModuleMarker module="calendar" />}
        description="A bounded synthetic destination for judging the floating navigation. Real Calendar integration remains outside M1."
      />
      <div className="max-w-xl rounded-dialog bg-blue-surface p-6 text-blue">
        <h2 className="text-section font-semibold">Portfolio review</h2>
        <p className="mt-3">17 October 2026 - 14:00 Asia/Manila</p>
        <p className="mt-2 text-sm">Career source - synthetic event</p>
      </div>
    </WorkArea>
  );
}

function ModuleMarker({
  module,
}: {
  module: "money" | "calendar" | "trackers" | "home";
}) {
  const Icon =
    module === "money"
      ? Wallet
      : module === "calendar"
        ? CalendarDays
        : module === "trackers"
          ? ListChecks
          : House;
  const tone =
    module === "money" || module === "home"
      ? "bg-accent text-accent-foreground"
      : module === "calendar"
        ? "bg-blue-surface text-blue"
        : "bg-plum-surface text-plum";
  return (
    <span className={cn("shrink-0 rounded-panel p-3", tone)}>
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

function RecordLink({
  row,
  compact = false,
  selected = false,
}: {
  row: ActivityRecord;
  compact?: boolean;
  selected?: boolean;
}) {
  return (
    <a
      href={proofUrl("activity", row.id)}
      aria-label={`Open record: ${row.title}`}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group inline-flex items-center gap-2 rounded-control font-medium text-link hover:bg-accent focus-visible:outline-ring",
        compact
          ? "min-h-12 border border-input bg-surface-subtle px-3 text-sm"
          : "min-h-8 px-1 text-sm pointer-coarse:min-h-12",
      )}
    >
      {compact ? (
        <span>Details</span>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "rounded-marker p-1",
              row.kind === "Transfer"
                ? "bg-blue-surface text-blue"
                : row.kind === "Income"
                  ? "bg-teal-surface text-teal"
                  : row.kind === "Refund"
                    ? "bg-plum-surface text-plum"
                    : "bg-accent text-accent-foreground",
            )}
          >
            <ReceiptText className="size-4" />
          </span>
          <span>{row.title}</span>
        </>
      )}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
      {selected ? <span className="sr-only">Selected record</span> : null}
    </a>
  );
}

function HomeProof() {
  return (
    <WorkArea>
      <ScreenHeader
        title="A little clarity for your day."
        marker={<ModuleMarker module="home" />}
        scope="Home · Saturday, 17 October 2026"
        action={
          <a href={proofUrl("expense")} className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-5" />
            Add expense
          </a>
        }
      />
      <div className="grid items-stretch gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section
          aria-label="Financial snapshot"
          className="flex flex-col justify-between rounded-dialog bg-focal-surface p-6 text-focal-foreground sm:p-8"
        >
          <div>
            <p className="text-sm text-focal-muted">Recorded liquid funds</p>
            <p className="numeric-value mt-3 text-focal font-bold">
              {money("4287550")}
            </p>
            <p className="mt-3 max-w-prose text-sm text-focal-muted">
              Across 3 active accounts · as of 17 Oct 2026
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-t border-focal-muted/40 pt-5">
            <div>
              <p className="text-xs text-focal-muted">
                Recorded spending · October
              </p>
              <p className="numeric-value mt-1 text-section font-semibold">
                {money("1262450")}
              </p>
            </div>
            <div>
              <p className="text-xs text-focal-muted">
                Credit liability · separate from cash
              </p>
              <p className="numeric-value mt-1 text-section font-semibold">
                {money("640000")}
              </p>
            </div>
          </div>
          <a
            href={proofUrl("activity")}
            className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-focal-foreground underline underline-offset-4"
          >
            Inspect account activity{" "}
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </section>
        <section
          aria-labelledby="attention-heading"
          className="rounded-dialog border border-blue/30 bg-blue-surface p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="attention-heading" className="text-section font-semibold">
              Next up
            </h2>
            <StatusBadge tone="warning">2 need attention</StatusBadge>
          </div>
          <ul className="mt-3 divide-y divide-border">
            <li className="py-4">
              <div className="flex gap-3">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0 text-information"
                />
                <div>
                  <p className="font-medium">Portfolio review</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Today · 14:00 Asia/Manila · Career
                  </p>
                </div>
              </div>
            </li>
            <li className="py-4">
              <p className="font-medium">Internet payment</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Due 19 Oct · {money("169900")} · planned
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Excluded from actual balances until recorded.
              </p>
            </li>
          </ul>
        </section>
      </div>
      <CoverageNotice title="Your snapshot reflects recorded history">
        Opening cutoffs and uncategorized entries can affect coverage. These
        figures are recorded funds, not a promise of spendable money.
      </CoverageNotice>
      <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section font-semibold">Recent activity</h2>
            <ProofLink screen="activity">View activity</ProofLink>
          </div>
          <CompactRecordList
            label="Recent financial activity"
            records={activity.slice(0, 3).map((row) => ({
              key: row.id,
              title: row.title,
              value: money(row.minor),
              metadata: `${row.date} · ${row.account}`,
              status: <StatusBadge>{row.kind}</StatusBadge>,
              action: <RecordLink row={row} compact />,
            }))}
          />
        </section>
        <section className="space-y-5">
          <h2 className="text-section font-semibold">Keep things moving</h2>
          <div className="rounded-panel bg-teal-surface p-5 text-teal">
            <p className="font-semibold">Reading log</p>
            <p className="mt-2 text-sm">
              A new template is ready to review. Existing entries stay on
              version 2 until migration completes.
            </p>
            <ProofLink screen="migration">Review template update</ProofLink>
          </div>
          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div className="rounded-panel bg-plum-surface p-4 text-plum">
              <Metric
                label="Career follow-ups"
                value="3"
                context="Due in the next 7 days"
              />
            </div>
            <div className="rounded-panel bg-warm-surface p-4 text-warm">
              <Metric
                label="Reading entries"
                value="120"
                context="Including archived entries"
              />
            </div>
          </div>
        </section>
      </div>
    </WorkArea>
  );
}

function RecordDetail({ row }: { row: ActivityRecord }) {
  return (
    <div className="space-y-4">
      <ReviewSummary
        title={row.title}
        rows={[
          {
            key: "amount",
            label: "Signed account movement",
            value: money(row.minor),
          },
          { key: "date", label: "Effective date", value: row.date },
          { key: "account", label: "Account", value: row.account },
          { key: "kind", label: "Type", value: row.kind },
          { key: "category", label: "Category / meaning", value: row.category },
          { key: "version", label: "Record status", value: row.state },
        ]}
      >
        <StatusBadge tone="success">Confirmed record · synthetic</StatusBadge>
      </ReviewSummary>
      <Disclosure title="Source and preserved history">
        <p>
          Canonical activity detail retains its financial action identity and
          revisions. This proof uses a synthetic source; it does not create or
          correct a transaction.
        </p>
      </Disclosure>
    </div>
  );
}

function ActivityProof({ record }: { record?: string }) {
  const wide = useWide();
  const selected = activity.find((row) => row.id === record) ?? activity[0];
  const [filter, setFilter] = useState("all");
  // Fixture selection represents distinct bounded source responses, not client search.
  const [applied, setApplied] = useState("all");
  const rows =
    applied === "cash"
      ? activity.filter((row) => row.account === "Everyday wallet")
      : activity;
  const columns: RecordColumn<ActivityRecord>[] = [
    {
      key: "record",
      label: "Record",
      cell: (row) => (
        <>
          <RecordLink row={row} selected={row.id === selected.id} />
          <p className="text-xs font-normal text-muted-foreground">
            {row.kind} · {row.state}
          </p>
        </>
      ),
    },
    {
      key: "date",
      label: "Effective date",
      cell: (row) => <time dateTime={row.date}>{row.date}</time>,
    },
    { key: "account", label: "Account", cell: (row) => row.account },
    {
      key: "amount",
      label: "Signed movement",
      numeric: true,
      cell: (row) => money(row.minor),
    },
  ];
  if (record && !wide)
    return (
      <WorkArea variant="record">
        <ScreenHeader
          title={selected.title}
          scope="Money · Activity · Synthetic record"
          action={<ProofLink screen="activity">Back to activity</ProofLink>}
        />
        <RecordDetail row={selected} />
      </WorkArea>
    );
  return (
    <WorkArea>
      <ScreenHeader
        title="Financial activity"
        scope="Money · Private workspace"
        marker={<ModuleMarker module="money" />}
        description="Exact account movements, with their original meaning and history."
        action={
          <a href={proofUrl("expense")} className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-5" />
            Add expense
          </a>
        }
      />
      <div className="flex flex-wrap gap-x-12 gap-y-6 rounded-dialog border border-accent-foreground/20 bg-accent px-5 py-5">
        <Metric
          label="Recorded spending"
          value={money("1262450")}
          context="1–17 October 2026 · synthetic snapshot"
        />
        <Metric
          label="Unclassified spending"
          value={null}
          context="Breakdown not provided"
        />
      </div>
      <DetailLayout
        {...(wide ? { detail: <RecordDetail row={selected} /> } : {})}
      >
        <div className="space-y-4">
          <FilterBar
            summary="Newest first · bounded fixture · no cross-page sorting or search"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filter);
            }}
          >
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <FormField htmlFor="source-filter" label="Funding source">
                <Select
                  id="source-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All recorded sources</option>
                  <option value="cash">Everyday wallet</option>
                </Select>
              </FormField>
            </div>
            <Button type="submit" variant="secondary">
              Apply filters
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFilter("all");
                setApplied("all");
              }}
            >
              Reset
            </Button>
          </FilterBar>
          {wide ? (
            <RecordTable
              label="Financial movements · newest first"
              records={rows}
              columns={columns}
              rowKey={(row) => row.id}
              selectedKey={selected.id}
              empty={
                <EmptyState title="No matching records">
                  Clear filters to see all recorded activity.
                </EmptyState>
              }
            />
          ) : (
            <CompactRecordList
              label="Financial movements · newest first"
              records={rows.map((row) => ({
                key: row.id,
                title: row.title,
                value: money(row.minor),
                metadata: `${row.date} · ${row.account}`,
                status: (
                  <StatusBadge>
                    {row.kind} · {row.state}
                  </StatusBadge>
                ),
                action: <RecordLink row={row} compact />,
              }))}
            />
          )}
          <PageControls
            page={cursorPage(
              { count: rows.length, nextCursor: null },
              (cursor) => `?cursor=${encodeURIComponent(cursor)}`,
            )}
          />
          <p className="text-xs text-muted-foreground">
            Financial activity is currently latest 100 actions. Account history
            supports cursors. No invented page count or next page.
          </p>
        </div>
      </DetailLayout>
    </WorkArea>
  );
}

function MigrationProof() {
  const [processed, setProcessed] = useState(50);
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  return (
    <WorkArea variant="editor">
      <ScreenHeader
        title="Review template migration"
        scope="Trackers · Reading log · Version 2 → 3"
        marker={<ModuleMarker module="trackers" />}
        description="Move entries deliberately. Every prior definition and entry revision remains available."
        action={
          <Popover
            trigger={
              <IconButton label="Migration help" variant="secondary">
                <CircleHelp className="size-5" />
              </IconButton>
            }
            title="Bounded processing"
          >
            <p>
              Each command processes at most 50 entries. Closing the browser
              does not promise continued processing. Cancel keeps committed
              batches.
            </p>
          </Popover>
        }
      />
      <ol
        aria-label="Migration stages"
        className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-4 text-sm"
      >
        <li className="text-muted-foreground">1 · Choose version</li>
        <li className="text-muted-foreground">2 · Map fields</li>
        <li className="font-semibold text-accent-foreground">
          3 · Review & process
        </li>
      </ol>
      <div className="grid items-start gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <ReviewSummary
            title="Reviewed mapping"
            rows={[
              {
                key: "title",
                label: "Book title",
                value: "Title → Title · same type",
              },
              {
                key: "rating",
                label: "Rating",
                value: "Text → Number · strict decimal",
              },
              { key: "status", label: "Status", value: "Finished → Complete" },
              {
                key: "default",
                label: "New field: Format",
                value: "Published default: Paperback",
              },
            ]}
          />
          <section className="rounded-panel border border-border bg-surface p-5">
            <h2 className="text-section font-semibold">
              Before / after sample
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              1 of up to 5 samples · not the full dataset
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Before · version 2</dt>
                <dd className="mt-2">
                  A field guide
                  <br />
                  Rating: “4.5”
                  <br />
                  Status: Finished
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">After · version 3</dt>
                <dd className="mt-2">
                  A field guide
                  <br />
                  Rating: 4.5
                  <br />
                  Status: Complete
                  <br />
                  Format: Paperback
                </dd>
              </div>
            </dl>
          </section>
          <CoverageNotice title="History stays available">
            Archived entries are included. Entry edits remain paused while this
            partial plan holds its lock. The tracker switches version only after
            all required entries resolve.
          </CoverageNotice>
        </div>
        <div className="space-y-5">
          <ReviewSummary
            title="Preview counts"
            rows={[
              { key: "total", label: "Total entries", value: "120" },
              { key: "valid", label: "Valid", value: "120" },
              { key: "invalid", label: "Invalid", value: "0" },
            ]}
          >
            <p className="text-xs text-muted-foreground">
              Invalid-entry links are bounded to the first 50 when present.
            </p>
          </ReviewSummary>
          <CommandStatus
            state={processed === 120 ? "confirmed" : "partial-completion"}
          >
            {processed} committed · {120 - processed} remaining · 0 invalid.
            {cancelled
              ? " Further processing cancelled. Committed entries remain."
              : " This is a synthetic server snapshot."}
          </CommandStatus>
          <div className="rounded-panel border border-border bg-surface p-5">
            <label htmlFor="migration-progress" className="text-sm font-medium">
              Confirmed progress
            </label>
            <progress
              id="migration-progress"
              value={processed}
              max={120}
              className="record-progress mt-3"
            />
            <p className="numeric-value mt-2 text-sm text-muted-foreground">
              {processed} of 120 entries
            </p>
          </div>
        </div>
      </div>
      {processed < 120 ? (
        <div className="space-y-4 border-t border-border pt-5">
          <label className="flex min-h-12 items-start gap-3 text-sm">
            <input
              className="mt-1 size-5 shrink-0 accent-primary"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the versions, mapping, defaults, affected counts and
            preserved history.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!confirmed}
              onClick={() => {
                setProcessed(Math.min(120, processed + 50));
                setCancelled(false);
              }}
            >
              {cancelled
                ? "Resume next fixture batch"
                : "Process next fixture batch (up to 50)"}
            </Button>
            <ConfirmationDialog
              trigger={
                <Button variant="secondary" disabled={cancelled}>
                  Cancel further processing
                </Button>
              }
              title="Cancel further processing?"
              description="Committed entries stay migrated. A partial plan retains its lock and can be resumed; cancellation does not undo completed batches."
              action={
                <Button
                  variant="danger"
                  onClick={() => {
                    setCancelled(true);
                    setConfirmed(false);
                  }}
                >
                  Cancel processing (fixture)
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <StatusBadge tone="success">
          All required entries resolved · fixture complete
        </StatusBadge>
      )}
    </WorkArea>
  );
}

function StateProof() {
  const [notice, setNotice] = useState("No menu action selected.");
  const [loading, setLoading] = useState(false);
  return (
    <WorkArea variant="editor">
      <ScreenHeader
        title="Shared interaction states"
        scope="M1 · Keyboard and appearance review"
      />
      <div className="flex flex-wrap gap-3">
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete fixture</Button>
        <Button variant="link">Source link style</Button>
        <Button disabled>Unavailable</Button>
        <Button loading loadingLabel="Saving…">
          Save fixture
        </Button>
        <IconButton label="More actions" variant="secondary">
          <MoreHorizontal className="size-5" />
        </IconButton>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          label="Invalid input"
          htmlFor="invalid-example"
          description="Enter an exact decimal amount."
          error="Use no more than two decimal places."
          required
        >
          <Input id="invalid-example" defaultValue="12.345" />
        </FormField>
        <FormField
          label="Disabled field"
          htmlFor="disabled-example"
          description="Unavailable until an account is selected."
        >
          <Input
            id="disabled-example"
            value="Readable disabled value"
            disabled
          />
        </FormField>
        <FormField label="Read-only value" htmlFor="readonly-example">
          <Input id="readonly-example" value="PHP 1,245.30" readOnly />
        </FormField>
        <FormField label="Native select" htmlFor="select-example">
          <Select id="select-example">
            <option>Everyday wallet</option>
            <option>Reserve account</option>
          </Select>
        </FormField>
        <FormField label="Notes" htmlFor="notes-example">
          <Textarea id="notes-example" placeholder="Optional note" />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent
            title="Edit fixture note"
            description="Tab stays within this dialog. Escape returns focus to its trigger."
          >
            <FormField label="Note" htmlFor="dialog-note">
              <Input id="dialog-note" />
            </FormField>
          </DialogContent>
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open sheet</Button>
          </DialogTrigger>
          <SheetContent
            title="Fixture filters"
            description="The same accessible dialog behavior in a contextual sheet."
          >
            <FormField label="Account" htmlFor="sheet-account">
              <Select id="sheet-account">
                <option>All accounts</option>
                <option>Everyday wallet</option>
              </Select>
            </FormField>
          </SheetContent>
        </Dialog>
        <Popover
          title="About coverage"
          trigger={<Button variant="secondary">Open help</Button>}
        >
          <p>Incomplete history remains visible beside exact values.</p>
          <a href={proofUrl("activity")} className={link}>
            Inspect source
          </a>
        </Popover>
        <Menu
          label="Fixture actions"
          trigger={
            <Button variant="secondary">
              Record menu
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          }
        >
          <MenuItem onSelect={() => setNotice("View history selected.")}>
            View history
          </MenuItem>
          <MenuItem onSelect={() => setNotice("Review correction selected.")}>
            Review correction
          </MenuItem>
          <MenuItem disabled>Unavailable action</MenuItem>
        </Menu>
        <ConfirmationDialog
          trigger={<Button variant="danger">Delete synthetic draft</Button>}
          title="Delete this synthetic draft?"
          description="Only the in-memory fixture would be discarded. Cancel receives focus first."
          action={
            <Button
              variant="danger"
              onClick={() => setNotice("Synthetic draft discarded.")}
            >
              Delete draft
            </Button>
          }
        />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {notice}
      </p>
      <Disclosure title="Definitions and source context">
        Disclosure uses native Enter/Space behavior and exposes its expanded
        state.
      </Disclosure>
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState
          title="No records yet"
          action={<Button variant="secondary">Add a fixture</Button>}
        >
          Start with one entry.
        </EmptyState>
        <EmptyState
          title="No matching records"
          action={<Button variant="secondary">Reset filters</Button>}
        >
          Your filters are retained.
        </EmptyState>
      </div>
      <InlineError
        action={
          <Button variant="secondary" onClick={() => setLoading(true)}>
            Retry fixture read
          </Button>
        }
      >
        The source is unavailable. Your draft is still here.
      </InlineError>
      {loading ? (
        <LoadingRegion label="Refreshing fixture records…">
          <div className="h-20 rounded-panel bg-surface-subtle" />
        </LoadingRegion>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            "draft",
            "review",
            "submitting",
            "confirmed",
            "validation-failure",
            "stale-revision",
            "unknown-outcome",
            "partial-completion",
          ] as const
        ).map((state) => (
          <CommandStatus key={state} state={state}>
            Domain-supplied evidence and recovery controls remain with the
            workflow.
          </CommandStatus>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <StatusBadge tone="success">
          <Check aria-hidden="true" className="size-3" />
          Confirmed
        </StatusBadge>
        <StatusBadge tone="information">
          <ArrowDownLeft aria-hidden="true" className="size-3" />
          Recorded income
        </StatusBadge>
      </div>
    </WorkArea>
  );
}
