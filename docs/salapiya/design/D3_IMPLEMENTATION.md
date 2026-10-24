# D3 — Core financial interaction prototype

**Later approval record — October 24, 2026:** D3 was approved in the D4 assignment;
the owner has now approved the complete prototype through D4. D5 finalization and
the accepted production visual baseline are recorded in the
[production handoff](D5_PRODUCTION_HANDOFF.md). The original implementation and
verification record below is retained; no production gate is closed by approval.

23–24 October 2026 (Asia/Manila). Branch `feat/salapiya-d3-financial-prototype`,
based on verified `fix/salapiya-floating-docks` / `de8541b`. The owner approved
the D2 redesign and authorized all D3 phases in one assignment. D3 is implemented
for live owner review; this is not production financial or security acceptance.

## Live review

Run `flutter run -d windows` or `flutter run -d emulator-5554` from
`apps/salapiya` (discover the actual emulator ID with `flutter devices`).
The approved shell, Overview composition, branding and floating docks remain.
Financial Overview links and quick actions now open D3 sources and workflows.

- **Money:** account representations and exact distribution bars; account detail,
  creation/cutoff, archive, history, search/type/category filters, paged activity,
  income, cash/card expense, category splits, transfer/fee, linked correction,
  refund/reversal and observed-balance adjustment. Detail exposes immutable source
  links and guards dependent refunds/adoptions.
- **Debts:** recognized liability, expected-payment timeline, debt detail/history,
  existing principal/charge import, net borrowing with withheld/recognized charges,
  unresolved or known payment allocation, later classification without cash replay,
  revised schedule with carried coverage, and provider payoff/recognized-charge
  waiver versus avoided-future-charge review. Residual principal and unresolved
  classifications block closure rather than inventing a balancing entry.
- **Cards** (Money → Cards): liability/card-credit presentation, utilization and
  available credit, purchase/payment/refund/fee/interest, statement evidence and
  unmatched difference, provider-confirmed payment coverage, representative
  installment revision/application and retained versions. No inferred interest.
- **Shared Expenses:** group selection/creation, participants, simulated invitation
  and manual claim consent, bill creation with multiple payers and selected equal
  or exact shares, creator-only corrections, independent refund axes, per-source
  pairwise explanation, confirmed/projected positions, pending/confirmed/manual/
  disputed/cancelled/reversed reports, partial/multi-bill allocation and advances.
  Private adoption supports new cash/card, existing purchase conversion and unpaid
  shares. Private follow-up preserves funding or explicitly reviews its correction.
  Actual settlement funding and clearing review remain independent of receipt.
- **Import** (Money → Import): fixed synthetic CSV rows, account/cutoff setup,
  duplicate/invalid selection, exact opening rebase, review/Edit, simulated progress,
  partial success, cancellation, stable-row retry and uncertain-result lookup.
  No file picker, file parsing, upload or database import is implemented.

All consequential forms support retained entry → validation → review → Edit →
simulated outcome. Result selector demonstrates accepted, pending, stale/conflict,
unavailable and uncertain outcomes. Money also exposes original-command lookup
after leaving a result. Profile utilities retain empty/incomplete/reset scenarios.
Use the Shared Expenses acting-identity/former-member controls to inspect UI
restrictions; these are explicitly simulations, not real authentication.

## Implementation boundaries

`lib/features/finance/contracts` contains exact read/effect models;
`application` owns memory-only previews, frozen command payloads, stable receipts,
source-version checks and synthetic state; presentation calls that boundary.
`PrototypeSession` owns and resets it. No packages, databases, migrations,
authentication, synchronization or financial posting adapters were added.

Canonical amounts remain BigInt centavos. Only bar geometry converts to double.
Cash, liabilities, expected schedules, unresolved clearing and group positions
are separate. Shared facts without an authorized private effect are excluded from
private Money activity. Refunds create a new retained group source revision.
Unknown-result checking reuses the original command. In-session accepted cash
is never deducted again by receipt confirmation, clearing review or reversal.

Overview's original 15–21 October chart/activity/category study remains its bounded
synthetic baseline; current wallet balances and Money Today follow the session.
The Money workspace is the live command/activity source. Group fixture cash is
independent until explicitly adopted. The scenario clock remains 21 October 2026.

## Historical Shared Expenses scenario traceability

Numbers refer to `docs/reference/v2/SHARED_EXPENSES_IMPLEMENTATION.md`. “Production”
below identifies checks outside this offline prototype, not a claim they passed.

| Historical scenarios | D3 interaction / boundary |
| --- | --- |
| 1 Registered group; 2 manual participant | Create group, People, invitation/claim consent and identity labels. Real tokens, verified identity and server membership: production. |
| 3 single payer/equal; 4 multiple payers | Bill form; independent payer and participant controls. |
| 5 payer total; 6 share total | Both exact sums validated against bill total. |
| 7 selected members; 8 custom shares | Participant checkboxes, Equal/Exact and per-person amount fields. |
| 9 reciprocal netting; 10 net-zero | Balances explanations and confirmed/projected net-zero position sum. |
| 11 retained sources; 12 pairwise explanation | Bill revisions, per-pair/per-bill remaining caps and immutable report versions. |
| 13 suggestions; 14 nonposting suggestions | Balances → suggested next step; requires review/agreement, never redirects or posts. |
| 15 full settlement; 16 custom partial | Report amount and exact source allocation, including full remaining caps. |
| 17 selected expenses; 18 partial selected; 19 multi-bill | Zero excludes a bill; positive selected allocations independently capped. |
| 20 overpayment/reverse | Explicit advance acknowledgement, projected reverse position and receipt reversal. |
| 21 pending; 22 waiting; 23 needs confirmation | Attention list, payment status/history and recipient review. |
| 24 confirmed updates; 25 dispute unchanged | Confirmed/projected views, dispute action and paused suggestions. |
| 26 manual limitations | Manual identity and explicit owner-entered/unverified receipt acknowledgement. |
| 27 versioned correction; 28 refund after settlement | Creator revision, two refund axes, old bills/payments retained; private review separate. |
| 29 cash nonduplication; 30 integrated Add Expense | Existing purchase → Share this purchase/adoption; shared bill optional own private effect. |
| 31 card nonduplication | Existing/new card adoption and explicit actual-refund private review. |
| 32 private funding hidden; 33 owner isolation | Group records omit private accounts; own-private review rejects another acting identity. Real RLS/security: production. |
| 34 former-member history | Former-member demo blocks new writes and retains private review. Entitlement filtering across real membership intervals: production; full lifecycle UI: D4. |
| 35 attention | Group confirmation attention and private difference/clearing views; Overview source links. |
| 36 exact rounding | Canonical participant order and BigInt equal remainder; focused exact tests. |
| 37 idempotence | Stable command and CSV-row result lookup within this session. Durable retry: production. |
| 38 concurrency | Frozen preview/global demo version and stale source rejection. Multi-device transactions/locking: production. |
| 39 mobile/reflow; 40 keyboard/accessibility | Shared adaptive forms, semantic Flutter controls, focus/Back and enlarged-text checks. Human Narrator/TalkBack certification remains owner/device acceptance. |

## Essential verification

Focused exact/state tests cover monetary splits, fees, refunds/dependencies,
debt clearing/classification, card effects, group net-zero/source caps, adoption,
receipt/reversal nonduplication, permissions, stale commands and CSV recovery.
Widget checks exercise complete entry/review/Edit/result and D3 surfaces/forms at
360 and 1280 logical widths, dark/light and enlarged text. Affected shell/Overview
checks retain floating navigation and source-return coverage.

The same `integration_test/financial_test.dart` journey passed on Windows and the
Android API 37 emulator. Windows and Android compile/run from the shared Dart
implementation. Native test text replacement uses EditableText's editing callback
because repeated test-IME entry returned an old value; monetary assertions remain.
Live Windows inspection checked Money and entry composition. No screenshot
collections, performance claims, production-gate closures or D4 implementation.
