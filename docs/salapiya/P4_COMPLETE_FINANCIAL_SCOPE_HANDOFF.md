# P4 — Complete Financial Scope

Work in progress, October 26, 2026 (Asia/Manila).
Branch: `feat/salapiya-p4-complete-finance`, based on verified P3
`26e59618691d6b29f0a2396d781791e910a96d24`.

## Acceptance decision

**P4 is not yet accepted.** This is the single primary P4 handoff and is being
updated during the continuous assignment. Implementation and evidence below are
bounded; missing or unexecuted work is not a passing acceptance result.
P5 Life and P6 distribution work have not started.

## Implementation and preserved contracts

`apps/salapiya/lib/finance/` extends the existing P1/P2 command journal and P3
private integration. It does not introduce a second ledger, balance store or
synchronization engine. The existing normal production shell routes Cards,
Debts and Planning to persisted native workflows. Existing expense entry accepts
card funding. Review, original IDs, encrypted drafts, explicit errors, immutable
revisions and source history are retained.

- `card_rules.dart`: card metadata/opening evidence, posted purchases with
  separate transaction/provider posting dates, pending authorization evidence,
  repayments, fees, interest, refunds, statements, provider membership,
  allocations, explicit installment schedules and applications.
- `debt_rules.dart`: imported recognized liability, borrowing/net proceeds,
  withheld/financed fees, financed purchases, actual payments, unknown clearing,
  later noncash classification, explicit schedules and stable-obligation
  revisions, provider-confirmed payoff and imported-unknown waiver treatment.
- `planning_rules.dart`, `recurrence_rules.dart`, `planning_queries.dart`:
  recurrence grammar/generation/overrides/actual links, budgets, goals,
  reservations/reallocation and read-only source projections. Queries and UI
  integration remain under development.
- `finance_screen.dart`, `debt_screen.dart`, `planning_screen.dart`: production
  reviewed editors, source/history, debt/card detail and planning management.
- `shared/shared_private_domain.dart`, `shared/shared_screen.dart`: explicit
  adoption of actual private card purchases and refunds. Group payloads contain
  neither card identity nor private funding/account information.

Native postings use the existing signed debit convention and exact BigInt minor
units. Money stays canonical decimal strings at JSON boundaries. Purchases post
expense/card liability once; payments post cash/liability only. Statements,
installment plans and planning definitions have zero postings. Card credit,
credit limits, uncertain debt clearing and reservations are not liquid cash.
Cash, spending, principal classification, recognized liability and contractual
dues remain distinct. Unknown principal/interest is not inferred.

The inherited card, debt, recurrence, budget, savings and forecast references in
`docs/reference/` remain authoritative for semantics. The Salapiya blueprint
governs native product decisions. Web sources, tests, migrations and pnpm tools
are preserved.

## Storage, authority and synchronization

SQLite schema 6 retains the schema-5 card liability, debt liability and debt clearing journal
classifications, introduced by rebuilding only the journal leaf transactionally. Schema 6 adds a narrowly authorized opening-cutoff transition for atomic historical imports. It copies
existing integer amounts, identities, ownership FKs and seals with FK enforcement
enabled. It preserves P1–P3 records and accepts supported archive schemas 1–5.
New domain evidence uses the existing immutable revisions and original commands;
backup replay must validate their recipes rather than import arbitrary postings.

Forward PostgreSQL migrations `20261026002100`–`20261026002600` independently
enforce cards, private card sharing, debts and planning through the existing
authenticated P2 command boundary. They were previewed and applied to the existing
verified `salapiya-dev` project in Tokyo. A transient management API HTTP 502
occurred before the first apply attempt; the subsequent verified attempt applied
exactly the six reviewed migrations. No reset, provider replacement, paid
activation or financial-history deletion occurred. Migrations 027?031 were subsequently previewed and applied to the same verified existing project: frozen replay/fresh review dates, atomic cash import and cutoff rebase, financial classification guards, private file metadata, and historical installment capacity. No attachment byte storage or scanning service was enabled.

PowerSync continues to transport original commands and owner-filtered accepted
P2 projections. No binary files or independently writable balances are added to
streams. Pending intent, server acceptance and downloaded reconciliation remain
separate. New ordinary card/debt recording can be retained offline; dependent
allocation/correction/capacity management uses the existing connected online
finalization boundary. Local-only management remains offline.

## Current M01–M17 traceability

| Row | Implementation / present evidence | Remaining acceptance |
| --- | --- | --- |
| M01–M03 | Existing production profile/accounts/cash preserved; focused P2/P3 SQL regressions pass | Consolidated affected native regressions pending |
| M04 | Native imported debt, borrowing/net proceeds/fees/financed purchase; Dart/PostgreSQL parity | Wider inherited debt fixtures and hosted/native options pending |
| M05 | Payments, clearing/classification, explicit schedules and stable-obligation revision; Windows/Android production journey passed | Additional allocation mapping, component and conflict cases pending |
| M06 | Exact provider payoff/closure and imported-unknown waiver; Windows/Android journey passed | Recognized-charge waiver/residual alternatives need completion/evidence |
| M07 | Real card domain and unified expense funding; Windows/Android production purchase/payment/credit passed | Full native refund/fee/correction matrix pending |
| M08 | Statements, allocations, installment schedules/applications; Dart/PostgreSQL parity, hosted allocation race passed | Individual native evidence/reconciliation workflows pending |
| M09 | Rules, explicit generation, overrides, partial actual links and exact link reversal; local/domain and hosted parity passed | Native journey and full supersession/coverage matrix pending |
| M10 | Period/category/basis/zero/archived-overlap rules and actual comparison; local/hosted parity passed | Native journey and report integration pending |
| M11 | Actual-cash reservations, release/reallocation, lifecycle and supported ranges; local/hosted parity passed | Native journey and date/recovery acceptance pending |
| M12 | Read-only projection implementation in progress | Native UI, coverage and full forecast parity pending |
| M13 | Production integration in progress | Complete reports, filters/export/Overview acceptance pending |
| M14 | Encrypted local objects, metadata/source history, AEAD/checksum checks, actual presence, safe bounded image preview, original-byte export, retained interrupted selections | Native picker acceptance pending; cloud bytes fail closed because production storage/scanning remains unverified |
| M15 | Maintained CSV parser with strict contract wrapper, explicit review/decisions, durable staging, stable child IDs, atomic cutoff rebase, cancellation and batch resume; local/SQL/hosted checks passed | Native picker/UI journeys pending |
| M16 | Financial source projection implementation in progress | Source invalidation/UI acceptance; P5 owns broader Calendar/native scheduling |
| M17 | Existing encrypted archive/recovery retained and schema compatibility extended | New-domain restore, attachment coverage and lifecycle/help acceptance pending |

## Executed evidence

- `integration_test/p4_cards_test.dart`: **passed native production end-to-end**
  on Windows and Android API 37 emulator, using separate synthetic profile/vault
  namespaces and a network-denying local composition. A PHP1,200 purchase leaves
  cash unchanged; a PHP1,500 payment yields PHP300 noncash card credit without
  another expense. Encrypted reopen/integrity checks pass. The first Windows run
  reached its assertions but failed in test cleanup because the runtime was
  closed twice; the corrected complete rerun passed. The failed run is not a pass.
- `integration_test/p4_debts_test.dart`: **passed native production end-to-end**
  on Windows and Android. PHP6,400 imported liability creates no cash; PHP1,000
  unknown payment enters clearing, then provider classification reduces liability
  PHP900 and recognizes PHP100 interest without another cash payment. A schedule
  revision retains its original allocation. PHP5,500 confirmed payoff closes the
  reconciled liability. The Android emulator was restarted without wiping data
  after it was no longer connected; the completed Android run passed.
- `test/p4_finance_test.dart`, `p4_shared_card_test.dart`, `p4_planning_test.dart`:
  **10 local/domain tests passed** in the consolidated focused run. Canonical
  fixtures are deterministic in `contracts/salapiya/p4_finance.json`; regeneration
  is opt-in with `P4_WRITE_FIXTURES=true`. Ordinary test runs compare the fixture.
- `p4-server.test.mjs`, `p2-server.test.mjs`, `p3-server.test.mjs`:
  **21 backend tests passed**, applying the full forward migration chain in
  PGlite. This is local PostgreSQL-engine evidence, not hosted synchronization.
- `p4-hosted-tests.mjs`: **5 hosted checks passed** using existing synthetic
  identities, signed Data API calls and independent actual PostgreSQL sessions.
  Exact card/debt/planning plans append to the existing synthetic P2/P3 profile;
  original receipts replay once; foreign/private access and direct writes are
  denied; competing allocations retain one acceptance and one rejection; card
  sharing/refund leaves liability −111,000, expense 37,000 and receivable 74,000
  minor units with no cash or clearing duplication and no card ID in group data.

**P3 inherited scenario 31 remains short of full native hosted acceptance.**
Local and hosted authority tests pass, and native card purchase/payment passes on
both platforms, but the complete hosted card-funded sharing/refund/correction
journey has not yet been exercised on both native targets. No full pass is claimed.

## Operational boundaries and outstanding work

All tests use synthetic data and isolated native storage. The pre-existing
untracked `apps/salapiya/android/build/` directory is preserved. No credentials,
OAuth secrets, sessions or recovery secrets are intended for tracked artifacts.
Free-tier resources are reused. Actual long-term quota/wire-volume certification,
retention operations, physical-device accessibility and distribution remain P6;
the small hosted fixture is not a sustainability guarantee.

The new pure-Dart timezone dependency is pinned to `timezone 0.11.2` (BSD-2-Clause)
for named IANA calendars, using bundled data without a runtime network request.
The publisher's [package documentation](https://pub.dev/packages/timezone)
describes the embedded database and Flutter initialization. Its bundled timezone
data version is a dependency fact, not a claim that future political timezone
changes are already covered.

Owner actions are not currently required. The remaining implementation and
acceptance work continues within the original authorized assignment. This file
will record actual blockers and the final readiness decision before completion.

## Additional checkpoint evidence (October 26)

- `test/p4_import_test.dart`: **5 local/domain tests passed**, including quoted fields, malformed/future/unsupported coverage, stable row provenance and idempotency, interrupted historical rebase rollback/conservation, and cancellation after a committed 50-row chunk. `contracts/salapiya/p4_import.json` is an opt-in generated deterministic Dart/SQL fixture.
- `test/p4_files_test.dart`: **2 local tests passed** for profile-purpose-derived AES-GCM encrypted objects, metadata AAD, wrong keys, tampering, checksum/size checks, actual missing bytes, retained originals, format-hints-only semantics and historical source links after correction.
- `test/p4_forecast_recovery_test.dart`: **3 local/domain tests passed** for exact bridge and installment basis, explicit expected-source exclusions and real-cash exclusion denial, mutually exclusive card bases/horizon bounds, stable reminder identity with revised version/date, and independent encrypted P4 restore. The archive preserves source recipes and import drafts, includes metadata coverage contract 1 and zero attachment byte objects, rejects wrong secrets/corruption, and cannot replace an active profile.
- Full focused P2/P3/P4 PostgreSQL run: **23 backend tests passed** with migrations 001?031. This includes independently computed import roots/children and exact golden plans.
- `p4-import-hosted.mjs`: **passed actual hosted authority checks** against the existing synthetic private profile: exact conserved opening rebase, stable historical row identities, original root receipt retry, metadata-only file state, and a legitimate financial correction retaining the original attachment source FK. This proves hosted SQL authority, not native CDC acceptance.
- `integration_test/p4_planning_test.dart`: **passed native production journeys on Windows and Android** for goal/reservation, zero budget, recurrence/generation, actual underfunding, partial actual link/unlink and read-only forecast. One settings instance is now shared by test runtime and app.
- Overview now projects actual debt/card/recurring source dues. History and daily/contribution views page complete datasets. P5 still owns device notification scheduling, permissions and broader Calendar behavior; these have not been certified.
- `flutter analyze`: **passed** after the new file/import/report/forecast/recovery UI integration.
- A broad default-concurrency Flutter run was interrupted after 171 passing tests: an inherited theme test expected the old Container surface, and the process-kill worker collided on the Windows native DLL. Inherited P1 widget tests also exposed fake-clock native teardown waits and an obsolete debt placeholder assertion. The tests now assert the current Material/Padding surface and real debt screen, advance the widget clock during bounded native cleanup, and use serial reruns. No interrupted run is counted as a full pass.
- Credential audit scanned **2,028 files with zero matches**, including working source and available native binaries/APK. Repeat after final builds and before final push.

The pinned `csv 8.0.0` package is used with dynamic numeric typing disabled. Its [publisher documentation](https://pub.dev/packages/csv) describes the current parser API. A strict bounded lexical and financial-contract wrapper rejects tolerant-parser ambiguities before any financial posting.
