# Screen, state and synthetic scenario inventory

> **Presentation baseline superseded - 27 October 2026.** The [final UI/UX redesign handoff](../FINAL_UI_UX_REDESIGN_HANDOFF.md) is the current implementation baseline for owner review and subsequent P6 work. Its neutral workspace, compact Windows sidebar/toolbar, Android navigation and shared form system replace D0-D5 presentation choices. Historical approvals and screenshots below remain context, not instructions to restore the former design. P0-P5 financial, identity, privacy, persistence and synchronization contracts remain authoritative. This change does not start or certify P6.

**Status — October 24, 2026:** D0–D4 completed and owner-approved; D5 finalized
under the owner's lightweight inspection/handoff scope. Current Windows/Android
UI/UX is the accepted production visual baseline; all data/operations remain
synthetic/in-memory. The [D5 handoff](D5_PRODUCTION_HANDOFF.md) records service
integration gaps and open G0–G8 gates. No production, security, accessibility,
performance or synchronization acceptance is inferred. See [D3 coverage and historical
scenario mapping](D3_IMPLEMENTATION.md) and [D4 coverage](D4_IMPLEMENTATION.md). Every listed financial
capability remains launch scope. D3/D4 placement determines prototype order,
not production release eligibility. Blueprint IDs refer to
[§4 and §19](../../SALAPIYA_PRODUCT_AND_PLATFORM_BLUEPRINT.md).

D1R updates the design/navigation selection only; financial and Life coverage is
unchanged. Android B floating and its + menu are selected (D1R-R02/R03).

## Screen families and blueprint traceability

Each screen family includes list/detail, creation where applicable, history,
permission, empty, loading, failure and coverage states. Domain details remain
in the linked source documents; a prototype is not the full acceptance suite.

| Screen family                | Blueprint coverage | Required screens and distinctive states                                                                                                                       | First proof                                |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Foundation gallery           | F01, A26           | Components, typography, both themes, lattice default/historical weave, brand rendering, keyboard/scale controls                                                                      | D1                                         |
| Shell / Overview             | M13, F01, A21      | Five destinations, Windows rail/dock, selected Android B, money/attention/agenda; complete versus incomplete/pending data                                            | D2                                         |
| Accounts                     | M01                | Account list/detail, creation, opening/cutoff, archive/history; no independently edited balance                                                               | D3                                         |
| Activity / entry             | M02                | Expense/income, category splits, cash/card source, completed transfer/fee, categories, filters and exact detail                                               | D3                                         |
| Corrections / reconciliation | M03                | Correction/refund/reversal, original/revised evidence, balance acknowledgement, reconcile/adjust; dependent-record rejection                                  | D3                                         |
| Debt setup / borrowing       | M04                | Existing liability import versus new borrowing, net proceeds, withheld fee and unknown breakdown                                                              | D3                                         |
| Debt payments / schedules    | M05                | Guided unresolved payment, exact classifications, due allocations, schedule revision/mapping and history                                                      | D3                                         |
| Debt settlement              | M06                | Provider-confirmed payoff, residual closure/adjustment, evidence, stale amount/version and dependent record block                                             | D3                                         |
| Cards                        | M07                | Card detail, purchase/payment, fee/interest/refund, overpayment/utilization; available credit separate from cash                                              | D3                                         |
| Statements / installments    | M08                | Statement list/detail/revision/reconciliation, allocations, installment creation/revision/application and history                                             | D3 representative; D4 complete inventory   |
| Recurring                    | M09                | Rule/version, occurrences, skip/override, partial actual link; expected amount never posted automatically                                                     | D4                                         |
| Budgets                      | M10                | Period/category/basis, net versus gross, overlap rejection, zero limit and historical comparison                                                              | D4                                         |
| Savings goals                | M11                | Goal progress, reserve/release/reallocate, supported funding and shortfall; no duplicate asset value                                                          | D4                                         |
| Forecast                     | M12                | Read-only sources, actual/expected/hypothetical series, coverage and recurring/card overlap explanation                                                       | D4                                         |
| Reports                      | M13                | Period/basis/filter, exact table and source drilldown, pending inclusion, initial-sync gate, synthetic export preview                                         | D4                                         |
| Supporting files             | M14, A27           | Source-linked private metadata, local/online-only/missing/upload-failed/unscanned states; no assumed group access                                             | D4                                         |
| CSV history import           | M15                | Supported-format setup, account/cutoff, duplicate preview, selection, post/retry/cancel and partial batch result                                              | D3 representative; D4 complete inventory   |
| Financial reminders          | M16                | Source-linked obligation and Calendar detail, permission denied, stale/cancelled reminder and delivery limits                                                 | D4                                         |
| Profile / utilities          | M17, F01, F02      | Three first-run choices, optional connect, safe collision, sync, backup/recovery, devices, settings/help/lifecycle                                            | D2 entry stubs; D4 full simulated journeys |
| Groups / people              | S01                | Groups, manual/registered/deleted participant, invitation/claim, membership and history; local-only connect explanation                                       | D3                                         |
| Shared bill                  | S02                | One/multiple payers, selected participants, equal/exact shares, deterministic remainder, preview                                                              | D3                                         |
| Shared correction            | S03                | Creator-only revision, reason, current versus stale revision, immutable earlier bill                                                                          | D3                                         |
| Shared refund                | S04                | Received-money allocation versus consumed-share credit; private evidence changed/review                                                                       | D3                                         |
| Settlement allocation        | S05                | Full/custom/selected bill, partial/multi-bill allocation and advance; exact source caps                                                                       | D3                                         |
| Settlement state/history     | S06                | Pending, confirmed, disputed, cancelled, reversed; recipient versus manual/unverified confirmation                                                            | D3                                         |
| Group positions              | S07                | Confirmed/projected, pairwise explanation, reciprocal netting and suggestions that do not post money                                                          | D3                                         |
| Private adoption             | S08                | Add Expense sharing, existing-purchase conversion, cash/card/unpaid adoption, own-private authorization                                                       | D3                                         |
| Private follow-up            | S09                | Clearing/reclassification, retained evidence and coverage after group changes; no automatic overwrite                                                         | D3                                         |
| Group lifecycle              | S10                | Group history/export, former-member entitlement, ownership transfer/owner-loss, removal and review needs                                                      | D3 core permission; D4 lifecycle           |
| Life Calendar                | L01                | Personal event create/edit, agenda/calendar, generated-source links, reminders, permission/quiet-hours state                                                  | D4                                         |
| Tasks                        | L02                | List/detail/create, status/deadline, completion/reopen, archive/history and reminder                                                                          | D2 glance; D4 full                         |
| Learning / Books             | L03                | Preset typed entries, basic progress/filter, detail/history; no custom template designer                                                                      | D4                                         |
| Career                       | L04                | Application detail, stages, interview/assessment/follow-up, notes/history, source-linked calendar and documents                                               | D4                                         |
| Deferred surfaces            | L05, L06, L07      | Deep Career analytics, custom tracker builder/migrations, advanced tracker reporting are deliberately excluded                                                | Not D1–D5                                  |
| Native reminder replacement  | F03                | Device-local delivery preferences; no web worker/email topology reproduced                                                                                    | D4 simulated settings                      |
| Excluded web operations      | F04                | Hosted web deployment/readiness and disposable web-data conversion are outside native migration; native/cloud operational acceptance remains engineering work | Not D1–D5                                  |

Source anchors:
[cards/statements](../../reference/v2/CREDIT_CARDS_AND_STATEMENTS.md),
[recurring](../../reference/v2/RECURRING_OBLIGATIONS.md),
[budgets](../../reference/v2/BUDGETS.md),
[goals](../../reference/v2/SAVINGS_GOALS.md),
[forecasts](../../reference/v2/FORECASTS.md),
[files/imports](../../reference/v2/FILES_IMPORTS_AND_PORTABILITY.md),
[Shared Expenses implementation and 40-scenario index](../../reference/v2/SHARED_EXPENSES_IMPLEMENTATION.md),
[trackers](../../reference/V3_TRACKER_WORKFLOWS.md).
The native blueprint supersedes stale deferrals in older documents. Do not infer
production completeness from this screen-family mapping.

## State dimensions

State dimensions are independent. Avoid one overloaded enum called `success`.

| Dimension      | Required distinctions                                                                                                      | UI obligation                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| View data      | Loading, first use, no filter matches, complete, partial, unavailable, failed, unauthorized                                | Never substitute an empty illustration or zero total for missing data                     |
| Interaction    | Pristine, dirty, invalid, reviewing, submitting, simulated completed, rejected, stale, unknown, partially completed batch  | Preserve draft or submitted evidence; distinct recovery actions                           |
| Profile        | Local-only, connected, enrolling, initial retrieval, collision, expired session, revoked access                            | Local profile != Google account != financial account                                      |
| Sync           | Not applicable locally, waiting for connection, pending acceptance, accepted awaiting reconciliation, synced, needs review | “Synced” requires accepted/reconciled scenario state; counts and as-of                    |
| Business state | Planned/actual, unresolved/allocated, pending/recipient-confirmed/manual-confirmed/disputed/reversed                       | Never equate transport success with financial confirmation                                |
| Authority      | Own private, active member, bill creator, recipient, owner administering membership, former member                         | Show permitted actions with reason when useful; display state is not security enforcement |
| Files          | Metadata only, local bytes, transferring, available, rejected/unscanned, missing                                           | No promise of offline preview or attachment-inclusive backup without bytes                |

Gallery controls may select combinations directly. Product-like prototype
journeys transition through the application scenario controller so every screen
sees the same state. Examples: synced + pending receipt; offline + complete local
history; online + incomplete initial snapshot; group rejected + genuine private
expense retained.

## Representative task proofs

| Journey                               | Interaction proof and expected meaning                                                                                                                              | Blueprint scenarios              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| J01 Local start / connected retrieval | Separate entry choices; local path no network; existing cloud retrieval no disposable profile; missing snapshot blocks complete amounts                             | A01, A03, A21                    |
| J02 Expense / transfer                | Exact amount/date/source/category and split validation; negative-balance acknowledgement; transfer is not income/spending; review/Edit preserves fields             | A02 (presentation only), M02–M03 |
| J03 Retry / conflict                  | Lost-response scenario retains submitted payload; repeat check does not produce another demo action; stale correction compares old/current/proposed evidence        | A05–A07                          |
| J04 Debt payment / settlement         | Separate cash, contractual payment, fee and unresolved classification; explicit due allocations and provider payoff evidence; rejected closure retains draft        | A16                              |
| J05 Card / statement                  | Purchase increases liability/spending; payment decreases cash/liability without spending twice; allocations, overpayment, revision and installment evidence visible | A17                              |
| J06 Shared creation / adoption        | Equal remainder and multiple-payer/exact-share review; private own effects separate from group facts; card adoption cannot double-post liability                    | A08–A10                          |
| J07 Shared settlement / reversal      | Partial and selected bills, advance, recipient/manual confirmation, dispute and reversal; confirmation cannot deduct cash twice                                     | A11                              |
| J08 Authority / source change         | Creator-only correction; owner cannot edit another private ledger; removed member cannot create new group facts; retained private evidence survives                 | A12–A14                          |
| J09 Planning                          | Rule changes/partial actual link, overlap/zero budget, reservation shortfall, forecast source overlap; plans never create actual money                              | A18                              |
| J10 Import / file                     | Duplicate preview, exact cutoff equation, partial batch cancellation; unavailable/unscanned file and explicit backup omissions                                      | A19, A27                         |
| J11 Life / reminders                  | Source event appears once; edit generated reminder opens source; complete/archive cancels future projected reminder                                                 | A20                              |
| J12 Recovery / lifecycle              | Wrong key/corrupt/incompatible file, interrupted restore, local/cloud collision, unsynced-work warning, old backup receipt reconciliation and revoked membership    | A04, A15, A22–A24, A28           |
| J13 Access / adaptation               | Keyboard/Narrator and touch/TalkBack complete entry/review, Back, large text, both themes and reduced motion                                                        | A26                              |

A25 signed upgrades is engineering-only; D4 may show a read-only update
information/error specimen but implements no updater. A02 crash durability,
A05–A07 distributed correctness and A12–A14 authorization are **simulated UI
outcomes only** here. They still need actual P0–P6 transaction, server, security
and device tests. Map all 40 historical sharing scenarios in D3's traceability
appendix to a prototype interaction/state or explicit production-only check.
Do not use thirteen representative journeys as permission to discard them.

## Synthetic fixture catalog

Use deterministic, invented “Demo household” data. Names such as Amihan, Tala and
Nico are fictional; accounts are “Cash wallet,” “Everyday bank” and “Mobile
wallet,” with no real account number, institution login, email or transaction.
All civil dates below are scenario dates, not dynamically inferred “today.”
The scenario clock is fixed at **2026-10-21, Asia/Manila**.

| Fixture    | Exact values / purpose                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-BASE     | Cash wallet `125000` centavos (₱1,250.00), Everyday bank `2485050` (₱24,850.50), Mobile wallet `320025` (₱3,200.25); liquid total `2930075` (₱29,300.75). Card liability `480000` (₱4,800.00) shown separately, never added to liquid money.           |
| F-EXPENSE  | Cash expense `18550` (₱185.50), split `15000` food + `3550` transport; wallet becomes `106450` (₱1,064.50). Total liquid after this isolated action `2911525` (₱29,115.25).                                                                            |
| F-PENDING  | Accepted total `2930075`; separate pending outflow `18550`; projected `2911525`. Incomplete snapshot instead shows unknown accepted total, not those complete-fixture figures.                                                                         |
| F-TRANSFER | Bank → mobile wallet `100000` (₱1,000.00), separate fee `1000` (₱10.00). Transfer alone leaves total unchanged; fee lowers liquid total to `2929075` (₱29,290.75). Not income.                                                                         |
| F-DEBT     | Actual paid `205000` (₱2,050.00), contractual `200000`, external fee `5000`. Known scenario: principal `180000` + interest `20000`; unresolved scenario does not invent that breakdown. Due allocations must match their defined contractual coverage. |
| F-ROUND    | Bill `10000` (₱100.00), three equal participants: `3334/3333/3333`; deterministic participant order is explicit, not randomized by display sorting.                                                                                                    |
| F-SHARED   | Amihan pays `120000` (₱1,200.00); three consume `40000` each. Amihan's private cash −120000, expense 40000, receivable 80000. Group positions +80000/−40000/−40000 sum to zero.                                                                        |
| F-SETTLE   | Tala reports `15000` to Amihan against 40000 owed. Before confirmation accepted positions unchanged; projected Tala remaining 25000. Recipient confirmation reclassifies coverage, never causes another cash movement.                                 |
| F-ADVANCE  | Tala reports `45000` against 40000: `5000` advance separately disclosed. In an isolated confirmed scenario, Amihan +35000, Tala +5000, Nico −40000 still sum to zero. No forced redistribution.                                                        |
| F-CARD     | ₱1,200.00 card purchase increases starting liability ₱4,800.00 to ₱6,000.00; cash unchanged. A separate ₱1,000.00 card payment lowers cash and liability, with zero additional purchase spending.                                                      |
| F-SCHEDULE | Electricity expected ₱1,850.00 due 2026-10-25; debt due ₱2,000.00 on 2026-10-28; interview on 2026-10-23; book/task due 2026-10-24. Expected bills are not actual expenses.                                                                            |
| F-FAILURE  | Empty, huge valid amount, invalid 3-decimal input, negative-balance ack, stale revision, missing source, unknown result, wrong backup key, denied permission, missing attachment                                                                       |
| F-SCALE    | Deterministically generated 10,000 activity rows, multi-year dates and long labels, bounded queries/windows; seeded totals supplied separately from the visible page                                                                                   |

Fixtures are independent starting points unless a journey explicitly composes
them. Do not accidentally apply the transfer and card-payment examples to the
expense fixture's displayed total. Keep canonical money as integer minor units
or decimal strings and format losslessly. The existing web per-component bound
of `100000000000` minor units is a useful boundary fixture, not a new certified
Dart/SQLite/server range: G3 must validate native storage and aggregate ranges.

Store no real personal data in demo assets. A persistent banner and About notice
state that in-memory actions reset on process close. Never show successful real
backup/export/authentication toasts for simulated interactions.

## Implemented D2 scenario mapping

Historical D2-only mapping below is retained. D3/D4 add the interactive workflows
recorded above; D5 does not refresh the fixed fixture clock or certify production
domain behavior.

`PrototypeSession` contains only in-memory presentation state. The scenario clock
remains 21 October 2026 even though implementation continued on October 23.

| Scenario | Money Today / source meaning |
| --- | --- |
| Populated local-only | F-BASE local complete total; no failed-sync implication. Shared records are explicitly illustrative examples, not live membership. |
| Connected current | F-BASE accepted snapshot at 09:00; recipient confirmation remains independently awaiting. |
| Waiting | Complete cached accepted snapshot with last-sync time; no fabricated current synchronization. |
| Pending effect | F-PENDING accepted 2930075, separate pending 18550 outflow, projected 2911525 centavos. |
| Initial download | Accepted total unavailable, no zero substitution; financial detail withheld and Life remains accessible. |
| Empty / first use | Complete empty local profile, zero liquid total and no accounts; distinguished from missing history. |
| Review | Accepted snapshot retained; explicit group-source/private-effect review, no silent private overwrite. |

Overview commitments follow F-SCHEDULE chronologically: Career interview 23 Oct,
reading task 24 Oct, electricity 25 Oct, card-obligation preview 27 Oct (amount
due deliberately unavailable, not inferred from liability), debt 28 Oct. The card
preview date is a D2 synthetic presentation extension. Shared and settlement
examples remain independent of the F-BASE liquid total and say so in detail.
D2 does not implement the financial commands of J02-J10, nor real J01/J12 identity,
restore or synchronization. Full scenario traceability remains required in D3/D4.
