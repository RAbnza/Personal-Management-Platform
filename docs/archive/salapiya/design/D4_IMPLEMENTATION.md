# D4 remaining UI/UX prototype

> **Historical record:** preserved development evidence. Current summary: [Development history](../../../DEVELOPMENT_HISTORY.md).

**Later approval record — October 24, 2026:** The maintainer personally reviewed and
approved the complete Windows/Android UI/UX through D4 in the D5 assignment.
D0–D4 are complete and approved; D5 is finalized under the explicitly
streamlined inspection/handoff scope. See the single
[production handoff](D5_PRODUCTION_HANDOFF.md). The current UI is the production
visual baseline, while all operations remain synthetic/in-memory and G0–G8 stay
open. Original pending-review language and verification below are historical;
D5 does not repeat or extend their acceptance claims.

D3 at `a9708d1` was approved in the D4 assignment. D4 extends that
implementation in one Flutter application for Windows and Android. The approved
shell, identity, typography and D3 financial entry/review flows are retained.
This is an interactive, synthetic, memory-only prototype awaiting review;
it does not close production gates or begin D5.

## Coverage and entry points

| Scope | Implemented interaction |
| --- | --- |
| M09 / J09 recurring | Money → Planning: income/bill/subscription rules, bounded daily/weekly/monthly generation, month-end policy, revisions, end/count, occurrence override/skip, partial actual links and retained history. Linked actual capacity is shared across occurrences; a correction requires unlinking first. |
| M10 / J09 budgets | Inclusive periods, category and net/gross basis, zero limits, overlap validation including archived allocations, progress, comparison and source evidence. Split expense categories retain exact centavo allocations through reversal/correction. |
| M11 / J09 savings | Goal creation/edit/status, reserve/release/reallocate by account, supported funding ranges and shared shortfalls. Reservations never add assets or post spending. |
| M12 / J09 forecast | Interactive actual/expected/hypothetical plot and exact daily/contribution tables; horizon, source exclusions, dated what-if adjustments, recorded future cash/openings, explicit recurring overlap review and mutually exclusive selected statement/installment assumptions. Unapplied provider evidence, card credit and suspended plans withhold unsupported card projections. Coverage exclusions are visible. |
| M13 reports | Period, account, category and net/gross filters, daily selection/chart, category breakdown, equal-period comparison, exact table, source drilldown and synthetic export preview. Pending effects remain separate; incomplete history blocks complete reports. |
| M08 / J05 cards | Multiple statement cycles, provider references/minimums, immutable revisions, existing payment/credit allocation and reversal, reconciliation notes and statement-linked files. Installment creation, source selection, optional complete component totals, revision/suspension, per-installment coverage/reversal and history without another purchase or payment. |
| M15 CSV | D3 stable batch/row retry retained across navigation, plus format/mapping/date interpretation and unsupported-format, currency, size, encoding and duplicate specimens. No real file ingestion. |
| L01 / J11 Calendar | Month calendar and daily agenda, filters, personal event create/edit/detail, source-derived financial commitments, tasks/tracker deadlines and distinct career events. Source edits/completion alter the projection rather than creating copied events. |
| L02 / J11 Tasks | Priority/status views, create/edit/deadline/progress, completion/reopening, archive and history. Shell quick actions use the same editors. |
| L03 / J11 Learning and Books | Separate learning unit/progress and reading cover/page views, preset typed records, goals, filters, progress entry, detail and history. No custom template designer. |
| L04 / J11 Career | Applications, company/role/location/notes, stage progression and history; independently editable interview/assessment/follow-up events, reminders, Calendar and private supporting metadata. |
| M16, F03 / J11 reminders | Source identity/version/date/amount determines reminder generation; preferences, in-app state, denied permission, quiet hours, private lock-screen copy, snooze/dismiss/restore and obsolete reminder history. No OS permission request or delivery. |
| M17, F01–F02 / J01, J12 | Three distinct first-run paths; reviewed local empty profile, fictional Google/connection/enrollment/collision/retrieval/expired/revoked scenarios; profile preferences, appearance/accessibility/navigation, devices, backup manifest omissions, restore modes/failure/resume, receipt-aware recovery, lifecycle and help. Profile replacement retains an in-session recovery copy without merging financial histories. |
| S10 / J08, J12 | Shared → Lifecycle: ownership transfer, leave/remove/detach/restore identity, archive, owner-loss recovery, online/stale/unavailable outcomes, entitled former-member history and group-only export preview. Owner role does not grant private authority; D3 S01–S09 commands remain in use. |
| M14 / J10 | Money → Files and contextual source links: private attachment metadata, local/online-only/missing/failed/transferring/unscanned/rejected/deleted states, guarded preview/download specimens and keep-offline preference. Backup manifests derive availability counts from this same state. No actual attachment bytes. |

## Implementation boundaries

`PlanningController`, `LifeController`, `ProfileController` and
`SupportingController` share the existing `PrototypeSession` and financial
controller. Card evidence extends the D3 controller. Editors retain drafts in
session memory and support review/Edit, stale and unavailable simulations.
View-state selectors expose loading/empty/unavailable/permission/stale specimens.
Only chart coordinates use floating-point approximations; amounts, allocations,
totals and labels use `BigInt` minor units and lossless decimal strings.

The scenario clock remains 21 October 2026, Asia/Manila. Views are bounded synthetic
fixtures, not certified financial domain or authorization implementations.
There are no new dependencies, databases, migrations, services, credentials,
network synchronization, exported archives, encryption or real deletion.
L05–L07, native notification delivery, production persistence/authentication and
G0–G8 engineering acceptance remain outside D4.

## Essential verification

Focused checks cover split-category evidence, recurrence dates/link caps, budget
overlap, shared reservation support, card revisions/allocation caps/no duplicate
posting, former-member entitlement and private authority. Shared D4 journeys
exercise planning/report/card entry, Life completion/progress, local onboarding
and recoverable replacement, ownership transfer and safe file availability.
Layout checks cover 320px at 200% text in dark mode and 1280px in light mode.
Affected D2 shell/Overview and D3 financial tests are retained with expectations
updated for implemented D4 destinations.

On 24 October 2026, Dart formatting and Flutter analysis passed. Focused D4
controller/widget/layout tests and affected D2/D3 regressions passed, with the
corrected legacy task-entry expectation rerun separately. All four shared D4
integration journeys passed on Windows and the API 37 Android emulator, including
second-statement creation and Calendar projection. Windows release and Android
debug builds succeeded. Empty-profile installment and paid-debt coverage edge
cases also pass focused tests; an allocated aggregate never invents a particular
debt installment's remaining due amount.

The Windows computer-use helper failed to initialize (`failed to write kernel
assets`) on both attempts. No manual desktop screenshot inspection is claimed.
Native interaction tests and responsive layout checks passed; visual
acceptance remains separate. No production gate or D5 acceptance is claimed.
