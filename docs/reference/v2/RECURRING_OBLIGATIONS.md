# V2-B — Recurring Obligations

## Authority and boundary

This domain consolidates Blueprint §6.9, System Architecture §12.4 and Database Architecture §12. The ledger remains the sole financial authority. V2-B implements planning only; Budgets, forecasts, external delivery, other domains and production deployment remain outside this assignment.

## Internal milestones

1. B1: private definitions, immutable recurrence versions, exact deterministic date generation, bounded preview and persisted occurrences.
2. B2: one-occurrence overrides/skips/cancellation, future supersession/archive, explicit partial financial links and immutable link reversals, correction conflicts and existing transaction creation workflows.
3. B3: accessible responsive management/review, Agenda and in-app reminders, consolidated domain/regression/database/browser acceptance.

Implementation proceeds sequentially. Focused checks protect intermediate contracts; one consolidated acceptance phase and one accepted domain commit/push supersede the earlier per-milestone full-suite/push workflow. This is the default for subsequent domains unless reassigned.

## Rules and dates

- Income, bill and subscription definitions have a name, PHP expected amount, optional owned category/account suggestions and named IANA timezone. Suggestions never override actual transaction choices.
- Supported grammar: daily intervals 1–365; weekly intervals 1–52 and selected ISO weekdays 1–7 (Monday first); monthly intervals 1–120 and day 1–31, with explicitly selected `last_valid_day` or `skip`. Weeks anchor to Monday of the effective start week; days before the effective start are excluded. Monthly intervals anchor to the effective start month. No weekend/holiday adjustments.
- An inclusive end date and/or emitted-occurrence count (1–10,000) may bound each immutable rule version. A count includes valid dates from that version's effective start, including historical dates outside a requested horizon; skipped short months do not consume the count. A replacement starts its own explicitly reviewed count.
- Calendar dates remain date-only. Calendar arithmetic uses date-fns in an explicit UTC calendar context; the definition's timezone determines local today and reminder instants. DST cannot move a logical all-day date. Existing timezone conversion handles reminder times.
- Supported dates span 1900–2199. Creation previews and records the next 90 days from the later of local today or the rule boundary; explicit generation can extend/review any supported window. Agenda retains the civil date, discloses the definition timezone and calculates its timing state in that timezone.
- Every generation command covers an explicit inclusive window of at most 366 days and at most 500 emitted dates. No read inserts occurrences, infinite schedules or nightly jobs. Generation is explicit and replayable; deterministic identities use obligation/logical date/generation, with one noncancelled generation per logical date. Repeated windows preserve existing overrides and terminal history.

## Occurrences and actual evidence

- `planned` has no links; `linked` has partial supported links; `completed` has linked amounts exactly equal to expected amount. `skipped` and `cancelled` have no effective links. Remaining = expected − effective links, using integer minor units.
- One-occurrence changes require an expected record version and reason; due date/expected amount overrides preserve original logical date and rule association, with exact before/after audit history. Completion cannot be asserted without actual evidence. Unlink uses one exact append-only reversal; a reversal cannot be reversed.
- Eligible actual actions are finalized current income for income plans, or cash expenses/card purchases for bills/subscriptions. Transfers, debt/card payments, fees, refunds and opening balances are not ordinary recurring receipts/purchases. Category/account suggestions are not eligibility restrictions. No inferred payment/date/provider allocation.
- A link captures the exact current action revision and explicit positive amount. Across all occurrences, unreversed links cannot exceed that action's recorded eligible amount; links cannot exceed expected amount. Duplicate/excess/foreign/stale links fail atomically under workspace serialization.
- Financial correction/reversal with effective occurrence links fails with an explicit dependency conflict. Reverse those planning links, perform the existing correction, then explicitly relink eligible corrected evidence. Link reversal history remains immutable. No silent reassignment or duplicate posting.
- Financial action detail lists effective occurrence confirmations with scoped links for resolving correction dependencies. Actual entry returns the committed action as a preferred eligible candidate; the separate link still requires review/confirmation. Candidate priority and pagination share a stable ordering.
- Actual creation uses the existing reviewed income/expense workflows, then explicit linking of their committed action. It is deliberately two confirmed steps: an interrupted link does not recreate a transaction; select the existing action. Command replay protects both workflows independently.
- Future changes create immutable rule versions at a future boundary in the definition's local calendar. Preserve completed, skipped, linked and historical occurrences. Cancel/regenerate only unlinked outstanding occurrences at/after that boundary; partial linked exceptions remain visible under their original rule. Archive stops generation and cancels only unlinked future plans; history and partially linked commitments remain reviewable.
- Both original logical date and current due date must be at/after a change/archive boundary before an unlinked plan is cancelled. Earlier due overrides remain historical commitments. Individual skipped/cancelled states are terminal history; generation never silently restores them. Historical unlinked expectations are labelled separately from active remaining obligations.

## Security and acceptance

Four documented `planning` tables use concrete scoped FKs, forced active-owner RLS, restricted runtime grants, immutable rule/link evidence, permanent command replay, private audit evidence, workspace locks and approved lifecycle purge. Expected activity cannot create financial revisions/journals. Agenda/reminders use concrete occurrence references; resolution/date changes invalidate obsolete reminder generations without financial effects. Actual reports exclude planning tables.

Nullable SQL rule/reversal checks explicitly reject NULL when a selected grammar or correction requires evidence. Runtime SQL tests verify this independently of API validation. The source view emits its own calendar context; bounded reminder reads materialize the requested source projection once, avoiding repeated RLS joins without relaxing ownership or transaction isolation. Planning commands advance the existing workspace read revision as A5 evidence commands do; this is cache/review metadata, not a financial posting.

Acceptance covers grammar/count/horizon/month-end/leap/DST, exact amounts, repeat/overlap generation, version boundaries/history, overrides/state/link reversal, partial/excess/duplicate/corrected/foreign actual evidence, same-command and competing capacity/version races, SQL/audit/receipt rejection, RLS/roles/lifecycle, financial nonduplication, reminder lifecycle/preferences, browser keyboard/Axe/320px/themes and unchanged V1/V2-A regressions. B1–B3 are locally accepted as of October 13, 2026 (Asia/Manila). Actual commands/results, bounded limits, deliberately omitted unrelated checks and V2-C prerequisites are recorded in handoff §22. No later domain is authorized.
