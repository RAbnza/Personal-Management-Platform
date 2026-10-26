# P4 - Complete Financial Scope

Work in progress, October 26, 2026 (Asia/Manila).
Branch: `feat/salapiya-p4-complete-finance`; verified P3 base:
`26e59618691d6b29f0a2396d781791e910a96d24`.

## Readiness decision

**P4 acceptance remains open.** This is the single primary P4 handoff. Implemented
features and executed evidence are distinguished below. Missing native journeys
are not covered by successful compilation or backend tests. P5 and P6 have not
started. Cloud file bytes fail closed under the explicitly authorized free-tier
exception; their production storage/scanning boundary remains a release blocker.

## Implementation and financial meaning

The normal production Flutter shell uses the existing P1 journal, P2 durable
commands and P3 private integration. There is no second balance store or sync
engine. `apps/salapiya/lib/finance/` supplies the following implementation:

| Code | Behavior |
| --- | --- |
| `card_rules.dart`, `finance_screen.dart` | Card metadata/opening, pending authorization, unified expense funding and splits, distinct transaction/provider posting dates, payments, credit, fees, interest, refunds, statement evidence, membership, allocations and explicit installment schedules/applications |
| `debt_rules.dart`, `debt_screen.dart` | Existing debt import, original versus outstanding principal, borrowing, withheld/financed fees, financed purchase, actual payments, unresolved clearing and later classification, stable schedule revisions, source-specific recognized charges/waivers, avoided future charges, residual evidence and exact payoff |
| `planning_rules.dart`, `recurrence_rules.dart` | IANA daily/selected-weekly/monthly rules, skip/last-valid day, bounded counts and dates, explicit generation, immutable future replacement, occurrence override/terminal states, partial actual links and exact unlink; category budgets; savings goals/reservations/reallocation/lifecycle |
| `planning_queries.dart`, `planning_screen.dart`, `source_list.dart` | Read-only forecasts, explicit statement or installment payment bases, source exclusions/overlap disclosures, actual opening/future cash bridge, reservation uncertainty and stable/versioned financial due projections |
| `reports_screen.dart`, `source_list.dart` | Complete applicable current journals before pagination, exact dates/account/category filters, equal-period comparisons, cash/spend/income/debt/card/shared/clearing classifications, immutable source navigation and formula-safe CSV |
| `cash_import_rules.dart`, `import_screen.dart` | Reviewed pmp-cash-activity version 1 PHP income/expense history, strict bounded parsing, per-row inclusion/category/duplicate consent, durable staging, provenance, stable child IDs, process/cancel/resume and atomic historical opening rebase |
| `file_rules.dart`, `file_store.dart`, `files_screen.dart`, `bounded_file_read.dart` | Private metadata, source history, encrypted local objects, bounded provider streams, actual byte presence, safe image preview, original-byte export, explicit local-copy removal and retained orphan inventory; fresh-restore original-byte recovery |

`lib/shared/shared_private_domain.dart` and `shared_screen.dart` adopt actual
private card purchases/refunds into P3. The original card movement is retained;
only personal consumption and private group receivable/payable are reclassified.
Group streams contain no private card ID. Description-only correction of an
existing exact-share bill now retains its recorded exact shares instead of
silently defaulting to Equal.

All authoritative money is BigInt integer minor units and canonical decimal
strings. Purchases recognize expense and card liability once; payments recognize
cash and liability once. Credit/available limits are not liquid assets.
Statements and schedules never create another purchase. Provider posting-date
statement comparisons show exact differences but neither invent membership nor
adjust balances. Minimum satisfaction and allocation order remain unknown without
evidence. Current card/debt totals and due coverage exclude future-dated actuals.
Civil date interval arithmetic uses UTC calendar dates, independent of DST.

Debt original principal is historical evidence, distinct from known outstanding
principal. New component evidence is opt-in `debtComponentContract: 1`; old
recipes retain their original interpretation. Explicit principal and recognized
charge reductions must sum to the recognized reduction and remain within source
capacity. Unknown reductions preserve conservative supported principal ranges.
Recognized-charge waivers offset the original expense category only; an imported
unknown opening waiver uses equity within remaining original opening capacity.
Financed fees can be waived from their original borrowing source; already paid
withheld fees cannot. Avoided unposted charges produce no postings. A retained
payoff must remain reconciled after correction/reversal; closure never forces a
balance to zero.

Historical V1-V3 references remain authoritative for monetary semantics:
`docs/reference/v2/` cards/statements, recurrence, budgets, savings, forecasts,
files/imports, and the historical debt acceptance rules. The approved Salapiya
blueprint controls native direction and identity. Existing web code, migrations,
tests and pnpm tooling remain executable and preserved.

## Persistence, authority and recovery

SQLite schema 6 accepts supported schemas 1-6. Schema 5 transactionally rebuilds
only the journal leaf to add card liability, debt liability and debt clearing.
Schema 6 permits a narrowly authorized opening-cutoff transition during an atomic
unsealed cash-opening rebase. Ownership FKs, original IDs, integer amounts,
immutable history and seals remain enforced; web migrations are never replayed
in SQLite. Existing accepted P1-P3 histories are not reset.

Forward PostgreSQL migrations 021-033 extend the authenticated P2 boundary:

| Migration | Authority |
| --- | --- |
| 021-023 | Cards, actual private card sharing and ordinary offline card intent |
| 024-025 | Debt domain and ordinary offline debt intent |
| 026-027 | Planning, frozen replay/fresh review dates and correction guards |
| 028-029 | Atomic cash-import roots/children/cutoff rebase, classification/provenance and original card movement guards |
| 030-031 | Metadata-only private supporting files and historical installment/payment capacity |
| 032-033 | Versioned debt components, source charge allocation/waivers, residuals, retained closure integrity and imported-opening waiver capacity |

All were previewed and applied to the verified existing `salapiya-dev` project
in Tokyo using `supabase-cli.mjs`, whose target check requires exact project
identity, region and healthy state. Migration 033's dry run listed only 033;
its subsequent apply succeeded. Applied migrations are retained unchanged.
No project/provider replacement, paid activation or hosted history reset occurred.

Local command contract 1 and transport contract 2 remain in use. PostgreSQL
independently computes recipes/postings; client ledgers are not accepted as
financial authority. Original immutable receipts survive retries. PowerSync
carries existing owner-filtered accepted commands and projections; pending intent,
server acceptance and downloaded reconciliation are separate. Atomic import
children reconcile as contiguous accepted history. No file blobs enter streams.

Encrypted backup formats 1 (local) and 3 (connected) remain supported. P4 adds
validated optional financial coverage contract 1 / recipe contract 1, with
attachment metadata counts and **zero byte objects**. Older archives without the
additive coverage are accepted under existing validation. Fresh replay validates
all recipes and original IDs in a separately keyed database. Archive secrets,
OS database keys and cloud credentials are separate. Restore cannot replace an
active profile, roll back accepted cloud history or revive revoked group access.
Original supporting bytes must be retained separately and can be reselected after
restore only when their exact immutable size/hash/type metadata agrees.

## Offline and finalization policy

All implemented local-only commands remain offline. Connected profiles retain
ordinary intent and encrypted drafts under the existing P2 model:

| Commands / actions | Connected policy |
| --- | --- |
| account, category, income, expense (including card-funded), transfer | Durable local pending command; later acceptance and download |
| creditCard, cardAuthorization, cardPurchase, cardPayment, cardFee, cardInterest | Durable local pending command; no module-wide online restriction |
| debtImport, borrowing, debtPayment | Durable actual evidence/pending command; server revalidates dependency/capacity conflicts |
| financialFile, fileDetach | Durable metadata intent; local bytes remain encrypted on this device; cloud bytes unavailable |
| refund, correction, reversal, adjustment, archive | Draft/review offline; connected acceptance requires fresh online authority |
| cardRefund, statement, statementLink, cardAllocation, installment, installmentApplication, financeCorrection, financeReversal | Draft/review offline; dependency-sensitive online finalization |
| debtClassification, debtSchedule, debtPayoff, debtAdjustment | Draft/review offline; dependency/capacity-sensitive online finalization |
| recurrence, recurrenceGenerate, occurrenceOverride, recurringLink, recurringUnlink | Draft/review offline; connected finalization online |
| budget, savingsGoal, reservation, savingsReallocation | Draft/review offline; connected finalization online, actual-date capacity rechecked |
| cashImport, cashImportChunk, cashImportPreview, cashImportDecision, cashImportProcess, cashImportCancel | Durable draft/staging/review locally; connected command finalization online; uncertain originals resolved before retry |
| Reports, forecasts, due projections, local file preview/export, archive capture | Read-only/local; coverage and pending status disclosed; no new money |
| P3 group/private commands | Existing authenticated group roles and private acceptance/freshness policy preserved |

Rejected/stale commands retain original receipt and review state. A local save is
never represented as remote reconciliation. Complex management is not used as a
reason to make ordinary card/debt recording online-only.

## M01-M17 traceability

Native evidence refers to normal production composition with real persisted
controllers and OS facilities. Isolated synthetic test profiles are used, not
replacement product screens.

| Row | Production scope and current evidence | Remaining acceptance |
| --- | --- | --- |
| M01-M03 | Existing profile/account/cash contracts retained; focused P1 widget/crash and P2/P3 SQL regressions passed | Final consolidated Flutter run and real Google regression pending |
| M04 | Debt import, original/outstanding principal, proceeds, withheld/financed fees and financed purchase; local/SQL/hosted parity; original native debt journeys passed on both platforms | Expanded component native journey passed both platforms; wider native borrowing options not executed |
| M05 | Actual unknown/known payments, later clearing classification, allocation mappings, stable schedule revisions; original Windows/Android journey passed | Expanded component journey passed Windows/Android |
| M06 | Exact payoff, source-specific recognized waiver, avoided unposted amount and residual; independent Dart/SQL/hosted fixture passed | Expanded native waiver/residual journey passed Windows/Android |
| M07 | Card purchase/payment/credit and encrypted reopen passed native Windows/Android; real hosted sharing/refund passed Windows | Android hosted sharing/refund rerun pending |
| M08 | Statement comparison, explicit membership/allocations and installment applications; local/SQL parity, real hosted allocation race | Wider native statement/installment/revision journey not executed |
| M09 | Rules/generation/overrides/partial actual links; local/SQL/hosted parity and native planning journey passed Windows/Android | Full native timezone/supersession matrix not executed |
| M10 | Zero budget, bounds, overlap including archives and net/gross bases; local/hosted and native planning evidence | Wider native correction/refund matrix not executed |
| M11 | Actual-cash reservations/reallocation/lifecycle and supported funding ranges; native underfunding passed both platforms | Wider connected capacity races not executed |
| M12 | Read-only exact actual/expected bridge, explicit card bases, exclusions and uncertainty; local/domain and both native planning journeys passed | Full native source-option matrix not executed |
| M13 | Complete filtered reports, history, comparisons, Overview dues and real CSV export | Final native filtered-export assertions in progress |
| M14 | Local encrypted file/link/type/size/AAD/hash/availability; Windows real picker/preview and fresh-restore exact original recovery passed; Android original picker journey passed | Extended Android fresh restore pending; cloud storage/scanning blocked |
| M15 | Reviewed strict cash CSV, stable batches, atomic cutoff rebase, cancellation and retries; local/SQL/hosted and native pick/import passed both platforms | Larger native capacity/interruption matrix not executed |
| M16 | Stable/versioned debt, statement and recurring sources, due revisions invalidate stale versions, Overview source navigation | Native notifications/broader Calendar belong to P5; no notification delivery claimed |
| M17 | Full-domain independent encrypted replay, metadata-only byte coverage, wrong-secret/corruption refusal; Windows actual save/fresh restore/reselect passed | Extended Android native restore and final lifecycle regression pending |

## Executed evidence

- `p4_cards_test.dart`: native Windows and Android local production pass. Purchase
  PHP1,200 leaves cash unchanged; payment PHP1,500 produces PHP300 noncash card
  credit, with no repeat expense; encrypted reopen and integrity passed.
- Original `p4_debts_test.dart`: native Windows/Android local production pass.
  Import PHP6,400, unknown cash payment PHP1,000, later reduction PHP900 and
  interest PHP100, retained schedule allocations after revision, then confirmed
  PHP5,500 payoff. Expanded component/waiver/residual journey also passed Windows (01:58) and Android (01:50): principal 800 -> 600, source charge allocation/waiver, avoided unposted interest, one-cent residual charge/waiver and exact closure; final cash PHP2,400 and spending PHP200.
- `p4_planning_test.dart`: native Windows/Android local production pass for
  goal/reservation, zero budget, recurrence/generation, actual underfunding,
  partial actual link/unlink and read-only forecast.
- `p4_connected_cards_test.dart`: **native Windows real hosted pass** after the
  exact-share correction fix. Actual SDK, durable offline intent, pause/resume,
  accepted original receipts and downloaded CDC; actual purchase/adoption,
  corrected group source/private re-review, actual card refund and private refund
  adoption. Exact final card-related totals: liability -111000, expense 37000,
  receivable 74000 minor units; no cash replay and no card ID in group document.
  Android has no retained completed passing result yet. P3 scenario 31 is not
  marked fully passed until both targets succeed.
- `p4_portability_test.dart`, opt-in native pickers: **Windows full pass**, log
  `build/p4-portability-windows-rerun.log`, 03:32, +1. Real PNG selection and
  verified preview, real cash CSV preview/post (cash PHP980 -> PHP1,055), report
  Save dialog, encrypted archive Save, new profile/key Restore Open, actual absent
  byte coverage, exact original PNG reselection/re-encryption and preview with no
  added journal command. Android's original three-picker journey passed; extended
  archive/fresh-restore journey remains pending. Recovery secrets stay in test
  memory and were not printed.
- `p4_finance_test`, `p4_shared_card_test`, `p4_planning_test`, `p4_import_test`,
  `p4_files_test`, `p4_forecast_recovery_test`: prior consolidated **20 local/domain
  tests passed**. Imports include malformed/unsupported/future input, immutable
  provenance/duplicates, 50-row cancellation, interrupted historical rebase and
  exact conservation. Files include AEAD/AAD/key/tamper/hash/absence and historical
  attachment source after legitimate correction.
- Latest focused run: **6 tests passed** across `p4_debt_components_test`,
  `p4_provider_dates_test`, `p4_forecast_recovery_test`. Includes conservative
  unknown components, source cap/waiver/financed fee/residual/closure, provider
  posting-date comparison, future allocation cutoff, forecasts and fresh replay.
- `p4_capacity_reports_test`: **1 local test passed** at the full 500-row limit,
  processing ten 50-row batches with original-command retries, exact cash and
  no duplicate income; 501 rows are refused. Full 501-income export exceeds UI
  pagination, preserves filters/exact amounts and escapes a formula description.
- `p4_bounded_file_test`: **1 local test passed**, including a provider stream
  larger than its declared size; byte bounds do not rely on reported length.
- Focused affected P1 widgets/floating actions/P2 crash tests: **21 passed serially**.
- Latest focused PostgreSQL suite: **25 tests passed** (`p2-server`, `p3-server`,
  `p4-server`, `p4-import-server`, `p4-debt-server`), applying migrations 001-033.
  PGlite engine tests are backend evidence, not hosted CDC proof.
- `p4-hosted-tests.mjs`: **5 real hosted checks passed** for exact graph plans,
  original receipts/mismatch, foreign/RLS/direct-write denial, independent-session
  allocation race (one accepted/one rejected), and real card sharing/refund.
- `p4-import-hosted.mjs`: **real hosted pass** for atomic cutoff/history equation,
  stable child IDs/original receipt, metadata-only file state and legitimate source
  correction retaining original source FK.
- `p4-debt-hosted.mjs`: **real hosted pass**, all 12 deterministic mapped command
  plans match independent server authority and original receipt retries, including
  imported principal, recognized charge allocation/waiver, avoided amount,
  residual, closure and borrowing financed-fee waiver.
- `dart analyze lib test integration_test`: **passed**, no issues, after the debt
  component/provider date changes. Latest empty-reference fix still needs final
  analysis in consolidated validation.
- Latest checkpoint credential scan: 2,046 source/artifact files, zero matches. Scan includes P3/P4 native logs and must be repeated after final builds.

Deterministic opt-in golden fixtures live in `contracts/salapiya/p4_finance.json`,
`p4_import.json`, and `p4_debt_components.json`. Ordinary runs compare exact plans;
fixture regeneration uses `P4_WRITE_FIXTURES=true`.

## Failed/interrupted runs and operational observations

No failed or interrupted attempt is counted as passing:

- Initial Windows card run passed assertions but double-closed cleanup; corrected
  complete rerun passed.
- Broad default-concurrency Flutter run was interrupted after 171 passing tests:
  stale inherited theme assertion and native DLL collision with a process-kill
  worker. P1 teardown used a fake-clock wait and an obsolete placeholder assertion;
  these were corrected and the affected 21-test serial rerun passed. Final broad
  serial run remains pending.
- Early hosted native attempts exposed a test pause/reconnect race, a stale source
  label and the real exact-share correction UI bug. Windows full corrected rerun
  passed. Android compilation once failed during an incomplete concurrent library
  edit; another host tool session lost its output, so no Android pass is claimed.
- Expanded Windows debt journey caught empty optional schedule references being
  treated as valid IDs. The view and domain lookups now require nonempty IDs;
  corrected complete Windows and Android reruns passed.
- One Windows portability run selected a mismatching original after restore;
  validation correctly refused it, and the test timed out. Correct full-path
  rerun completed all six native dialogs and passed.
- An Android picker attempt failed end-of-test SemanticsHandle cleanup after
  external accessibility inspection near completion. A clean original journey
  rerun passed; no interrupted/cleanup-failed run is substituted for it.
- Flutter 3.47.7 native `flutter test` defaults to uninstalling the package. This
  removed an emulator synthetic installation/cache during earlier acceptance;
  hosted accepted history remained intact. Subsequent native runs explicitly use
  `--no-uninstall`, retain installation state and never wipe the emulator.
- Computer Use availability has varied during this session. Windows's completed
  native dialog proof used the working CUA API. The older node_repl helper
  currently reports `failed to write kernel assets`; this is tooling failure,
  not successful UI evidence.

## Files, privacy, free tier and release boundaries

Local attachment objects use AES-GCM with a purpose/owner-derived key from the
protected profile key, immutable metadata AAD and hash checks on read/export.
Opaque paths, flushed staging/rename, 10 MiB/file, 1,000 retained objects and
1 GiB/device bounds apply. PNG/JPEG decoded dimensions are bounded; PDF is offered
as original export, without claiming a safe embedded renderer. Extension/signature
agreement is a format hint, never a malware-scan result. Archived links cannot
be opened as active attachments. Removed local copies do not delete financial
source history; orphans remain visible for explicit review.

Cloud metadata says `unavailable_unscanned` and `device-local-only`. Upload,
download, provider authorization/scanning, cloud transfer recovery and keep-offline
certification are **blocked**, not faked. Viable future options require a verified
private object policy plus maintained scanning/quarantine within existing free
resources, or an explicitly approved changed operational boundary. No paid service
has been introduced or purchased.

Supabase, PowerSync JP Development and Google OAuth development resources are
reused. The fixture traffic is bounded synthetic append-only history; it is not a
quota certification for twenty users. Measure actual DB growth, command JSON/CDC
wire volume, connection limits, retention and backup size before P6 release.
Local attachment caps do not imply free hosted byte allowance. No recurring
artificial keepalive, extra instance, worker or binary replication was added.

Production amount privacy masks new display totals and raw source fields. CSV and
original-byte export are explicit private file operations. No card/account/debt
private identities are added to group data. Credentials/configs remain in ignored
private directories and OS slots, not Dart defines containing refresh secrets.

Direct pure-Dart dependencies are pinned: [timezone 0.11.2](https://pub.dev/packages/timezone)
for bundled IANA rules and [csv 8.0.0](https://pub.dev/packages/csv) with numeric
inference disabled. The parser is surrounded by strict lexical/financial bounds.
The bundled timezone database needs maintained updates when civil rules change.

## P5 handoff boundary and remaining work

P4 financial reminder sources expose stable ID, source revision/version, date,
amount and kind; revisions invalidate stale projections and never create money.
Overview consumes these sources without duplicating calendar entries. P5 must
own notification permission, platform/background scheduling, delivery/reboot/timezone
rescheduling and broader Calendar UI. No native notification delivery is claimed.
Physical-device acceptance, distribution, signing and release-scale performance
remain P6. P4 does not begin Life Tasks, Career or unrelated trackers.

The production Profile Help explains money classifications, planning uncertainty,
imports, local-only file bytes, backup coverage, archive/sign-out and notification
boundaries. Existing profile/recovery and private/group authority lifecycles are
preserved. Account deletion/retention certification remains explicit release work.

Owner action is not currently required. Independent implementation/verification
continues within the authorized assignment. Before final publication: complete
remaining native runs, consolidated serial Flutter checks/builds/credential audit,
update this readiness decision with actual evidence, commit and push this branch.
