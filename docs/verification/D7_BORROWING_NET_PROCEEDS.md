# D7 borrowing and net proceeds verification

Baseline inspected: `main` at `9d9604ab2d459c7110aaff3ed99763346c36c137`.
Verification date: 8 October 2026 (Asia/Manila).

Implemented new borrowing as an actual financial action through
`POST /api/v1/financial-actions`. D7 records debt originated during tracked
history and remains separate from D6b existing-debt import.

A borrowing records the actual cash received, recognized debt liability,
provider-confirmed borrowing fees, optional initial manual schedule, audit
evidence, command receipt, and owner-scoped debt/read-model records atomically.

## Accounting behavior

Borrowed principal is never income.

For PHP 10,000 principal with a PHP 200 withheld fee and PHP 9,800 actually
received, the canonical accounting is:

- cash asset: +980000
- fee expense: +20000
- debt liability principal: -1000000
- income: 0

A withheld fee reduces actual proceeds but does not create an additional cash
fee-out posting.

For a capitalized fee, cash proceeds are not reduced. The fee remains an
expense and also increases recognized debt liability.

For example, PHP 10,000 principal with a PHP 200 capitalized fee produces:

- cash asset: +1000000
- fee expense: +20000
- debt liability principal: -1000000
- debt liability fee: -20000
- recognized liability: 1020000
- income: 0

Distinct withheld and capitalized provider charges may coexist. A single fee is
not simultaneously treated as both.

All authoritative financial amounts remain exact minor-unit strings at
transport boundaries and bigint values in accounting/domain logic. No
authoritative money arithmetic uses JavaScript `Number`.

## Borrowing contract

The D7 borrowing command supports:

- personal loans;
- installment loans;
- flexible manual obligations;
- receiving financial account;
- contractual principal;
- actual cash received;
- withheld borrowing fees;
- capitalized borrowing fees;
- optional expense categories for fees;
- optional provider-supplied initial manual schedule;
- description, provider reference, and notes.

`financed_purchase` is deliberately excluded from the cash-borrowing workflow.
It requires a different economic recipe and is not implemented by D7.

The borrowing date must be after the receiving account's opening cutoff. The
receiving account must be active, owned by the authenticated workspace, and use
the workspace currency.

For withheld fees:

`actual received = contractual principal - total withheld fees`

Withheld fees cannot consume the entire principal.

Capitalized fees do not reduce actual proceeds.

Newly originated debts have no opening cutoff. Their initial schedule contains
no historical opening satisfaction; opening-satisfaction evidence remains
specific to imported pre-tracking debt history.

## Persistence and integrity

D7 adds:

- `0022_d7_borrowing_integrity.sql`
- `0023_d7_borrowing_action_kind.sql`

The borrowing action kind is now accepted by the financial action revision
schema.

The deferred borrowing recipe validator enforces the complete posted borrowing
shape, including:

- one borrowing debt link;
- one receiving-account receipt detail;
- one economic journal;
- positive borrowing cash inflow;
- principal debt-liability recognition;
- exact fee-expense evidence;
- liability-backed withheld/capitalized fee components;
- capitalized-fee liability recognition;
- zero income postings;
- no separate cash fee-out posting for the D7 withheld-fee model;
- correct receiving-account ownership, currency, activity, and cutoff;
- balanced journal totals;
- opening-cutoff exclusion for newly originated debt.

The existing S1 recipe validator excludes borrowing so the dedicated D7 recipe
owns its integrity rules.

## Idempotency and ownership

Borrowing uses a financial command receipt before resolving mutable financial
references.

A committed retry with the same client command ID and identical economic intent
returns the original result without creating another debt, action, receipt,
schedule, or cash movement.

Reusing the command ID with changed economic intent returns an idempotency
conflict.

`requestId` is attribution metadata and is excluded from canonical command
hashing, so a lost-response retry may safely use a new server request ID.

User ID, workspace ID, session ID, and request ID are derived from trusted
server `ActorContext`. They are never accepted from the browser borrowing
payload.

Foreign or unavailable financial accounts, expense categories, debts, and
workspaces remain inaccessible through the private reference boundary.

## Read models and UI

The debt list now supports both:

- recording new borrowing that begins during tracked history; and
- importing an existing provider-confirmed debt from before tracking began.

Debt detail distinguishes imported opening debt from newly originated
borrowing. New borrowing no longer displays opening-baseline language.

The borrowing form includes:

- active receiving-account selection;
- exact principal and actual-proceeds entry;
- withheld or capitalized fee entry;
- optional fee categorization;
- optional provider-supplied installments;
- review before confirmation;
- exact accounting-effect preview;
- zero-income disclosure;
- uncertain-save handling;
- same-command safe retry;
- navigation to committed debt detail after confirmed success.

A malformed successful HTTP response is not treated as confirmed persistence.

Account history shows the actual borrowing cash receipt against the receiving
account. Debt reads derive recognized liability from ledger postings rather
than trusting duplicated mutable balances.

Existing D6b Agenda projection continues to expose current unpaid debt
installments using the shared debt schedule model.

## Automated verification

The complete migration chain was verified against a newly created disposable
database.

`pnpm db:verify:chain` reported:

- all 24 migrations applied successfully from an empty database;
- a repeated migration run was a no-op;
- D6b concurrent import/replay/conflict behavior remained valid;
- D6b debt and Agenda ownership isolation remained valid;
- D7 borrowing net proceeds were exact;
- D7 fee expense and zero-income treatment were exact;
- D7 lost-response replay returned the original command result;
- D7 account history reflected the exact received cash;
- D7 debt reads reflected the exact recognized liability;
- D7 cross-owner debt isolation remained intact;
- combined D6b/D7 postings remained balanced and auditable.

The development database was migrated only after the empty-database migration
chain passed.

The following final gates passed:

- database bootstrap connection checks;
- database runtime connection checks;
- lint;
- TypeScript type checking;
- formatting checks;
- complete unit/component test suite;
- complete integration test suite;
- production Next.js build;
- isolated migration-chain verification;
- Git whitespace validation.

Focused D7 tests additionally cover:

- borrowing domain validation;
- withheld fees;
- capitalized fees;
- mixed distinct fee treatments;
- invalid net proceeds;
- financed-purchase rejection;
- schedule validation;
- exact large bigint calculations;
- PostgreSQL borrowing-recipe constraints;
- service-layer persistence and replay;
- debt read models;
- account history;
- reference boundaries;
- HTTP ActorContext ownership;
- review/confirm UI behavior;
- exact browser payload serialization;
- malformed success responses;
- uncertain-save replay using the identical command;
- provider-supplied installment serialization.

## Browser acceptance

Automated component tests verify semantics, labels, review focus, exact
financial previews, payloads, navigation intent, validation, and safe retry
behavior.

They do not establish complete real-browser acceptance for responsive layout,
visual overflow, theme rendering, keyboard traversal, focus appearance, or
interactive behavior in a production browser.

Manual browser acceptance therefore remains a separate milestone gate unless it
is completed and recorded before the D7 commit.

## Scope boundary

D7 does not implement debt payments or payment allocation.

In particular, D7 does not:

- apply payments to recognized liability;
- allocate payments across principal, interest, or fees;
- satisfy installments from real payments;
- revise contractual schedules;
- perform early settlement;
- implement financed-purchase origination;
- implement reconciliation or financial corrections.

Those behaviors belong to later V1 milestones.

D8 remains the next financial milestone: debt payments and allocation.

This document is D7 milestone evidence, not a V1 completion claim. No V2 or V3
work has started as part of D7.